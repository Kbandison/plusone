import "server-only";

import { RADIUS } from "@plusone/config";
import { drop as dropLogic } from "@plusone/logic";

import { getServerSupabase } from "./supabase";

/**
 * Tonight's Drop.
 *
 * Computed once per member per local day and STORED. A drop recomputed on every
 * page load would hand back a different three whenever anyone's activity
 * changed — reload and someone is gone. "Tonight's Drop" has to be tonight's,
 * so the served ids are written to `drops` and read back for the rest of the
 * day.
 */

export interface DropCard {
  readonly id: string;
  readonly displayName: string | null;
  readonly age: number | null;
  readonly ageBand: string | null;
  readonly intention: string | null;
  readonly distanceMi: number | null;
  readonly photoPrivacy: string | null;
}

export interface TonightsDrop {
  readonly cards: readonly DropCard[];
  readonly radiusUsedMi: number;
  readonly radiusExpanded: boolean;
  readonly memberRadiusMi: number;
  readonly preview: boolean;
}

interface CandidateRow {
  id: string;
  display_name: string | null;
  age: number | null;
  age_band: string | null;
  intention: string | null;
  photo_privacy: string | null;
  last_active_at: string;
  distance_mi: number | null;
  times_served: number;
  already_connected: boolean;
  last_served_to_viewer_at: string | null;
}

/** The member's own local date, which is what a drop is keyed on. */
function localDate(timezone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  } catch {
    // An unknown timezone must not cost someone their drop.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(now);
  }
}

export async function getTonightsDrop(userId: string, now = new Date()): Promise<TonightsDrop> {
  const supabase = await getServerSupabase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("search_radius_mi, timezone, mode, intention")
    .eq("id", userId)
    .maybeSingle();

  const memberRadiusMi = profile?.search_radius_mi ?? RADIUS.defaultMi;
  const preview = profile?.mode === "support_only";
  const dropDate = localDate(profile?.timezone ?? "UTC", now);

  const { data: existing } = await supabase
    .from("drops")
    .select("served_profile_ids, radius_used_mi, is_preview")
    .eq("user_id", userId)
    .eq("drop_date", dropDate)
    .maybeSingle();

  if (existing) {
    return {
      cards: await loadCards(existing.served_profile_ids as string[]),
      radiusUsedMi: existing.radius_used_mi,
      radiusExpanded: existing.radius_used_mi > memberRadiusMi,
      memberRadiusMi,
      preview: existing.is_preview,
    };
  }

  const { data: rows } = await supabase.rpc("drop_candidates", {
    p_max_radius_mi: RADIUS.maxMi,
  });

  const candidates = ((rows ?? []) as CandidateRow[]).map((row) => ({
    id: row.id,
    distanceMi: row.distance_mi ?? Number.POSITIVE_INFINITY,
    intention: (row.intention ?? "open_to_either") as never,
    // No quiz vector by design — see the note in 20260814000700_drop_candidates.sql.
    quizVector: null,
    lastActiveAt: new Date(row.last_active_at).getTime(),
    timesServed: Number(row.times_served ?? 0),
    // The RPC reads visible_profiles, which has already applied every wall, so
    // anything that reaches here is verified and unblocked by construction.
    verified: true,
    blocked: false,
    reportPending: false,
    alreadyConnected: row.already_connected,
    lastServedToViewerAt: row.last_served_to_viewer_at
      ? new Date(row.last_served_to_viewer_at).getTime()
      : null,
  }));

  const result = dropLogic.selectDrop(
    {
      intention: (profile?.intention ?? "open_to_either") as never,
      quizVector: null,
      radiusMi: memberRadiusMi,
      mode: preview ? "support_only" : "dating",
    },
    candidates,
    now.getTime(),
  );

  const servedIds = result.cards.map((c) => c.id);

  // Unique on (user_id, drop_date), so two tabs opening at once settle on one
  // drop rather than racing to write two.
  await supabase.from("drops").insert({
    user_id: userId,
    drop_date: dropDate,
    served_profile_ids: servedIds,
    radius_used_mi: result.radiusUsedMi,
    is_preview: result.preview,
  });

  return {
    cards: await loadCards(servedIds),
    radiusUsedMi: result.radiusUsedMi,
    radiusExpanded: result.radiusExpanded,
    memberRadiusMi,
    preview: result.preview,
  };
}

/**
 * Re-reads the served profiles through `visible_profiles`, so a member who
 * blocks someone after the drop was built stops seeing them immediately. The
 * stored ids are a record of what was chosen, never a bypass of the wall.
 */
async function loadCards(ids: readonly string[]): Promise<readonly DropCard[]> {
  if (ids.length === 0) return [];

  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("visible_profiles")
    .select("id, display_name, age, age_band, intention, distance_mi, photo_privacy")
    .in("id", [...ids]);

  const byId = new Map((data ?? []).map((row) => [row.id as string, row]));

  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id as string,
      displayName: row.display_name as string | null,
      age: row.age as number | null,
      ageBand: row.age_band as string | null,
      intention: row.intention as string | null,
      distanceMi: row.distance_mi as number | null,
      photoPrivacy: row.photo_privacy as string | null,
    }));
}
