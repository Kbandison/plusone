import "server-only";

import { RADIUS } from "@plusone/config";
import { drop as dropLogic } from "@plusone/logic";

import { serviceClient } from "./cron";
import { getServerSupabase } from "./supabase";
import { dropConfig } from "./tunables";

/**
 * Tonight's Drop.
 *
 * Computed once per member per local day and STORED. A drop recomputed on every
 * page load would hand back a different three whenever anyone's activity
 * changed — reload and someone is gone. "Tonight's Drop" has to be tonight's,
 * so the served ids are written to `drops` and read back for the rest of the
 * day.
 */

/**
 * A full card. Only ever built for a dating-mode viewer.
 */
export interface DropCard {
  readonly id: string;
  readonly displayName: string;
  readonly age: number | null;
  readonly intention: string | null;
  readonly distanceMi: number | null;
  readonly photoPrivacy: string | null;
}

/**
 * A Preview Drop card (Decision #19).
 *
 * A different TYPE, not a full card with fields left unrendered. There is no
 * `displayName` here and no exact distance, so a preview cannot accidentally
 * carry either — the redaction is in the shape as well as in the query.
 */
export interface PreviewCard {
  readonly id: string;
  readonly ageBand: string | null;
  readonly intention: string | null;
  readonly distanceBucketMi: number | null;
}

export type TonightsDrop =
  | {
      readonly preview: false;
      readonly cards: readonly DropCard[];
      readonly radiusUsedMi: number;
      readonly radiusExpanded: boolean;
      readonly memberRadiusMi: number;
    }
  | {
      readonly preview: true;
      readonly cards: readonly PreviewCard[];
      readonly radiusUsedMi: number;
      readonly radiusExpanded: boolean;
      readonly memberRadiusMi: number;
    };

interface CandidateRow {
  id: string;
  display_name: string | null;
  age: number | null;
  age_band: string | null;
  intention: string | null;
  photo_privacy: string | null;
  /** The candidate's own mode. A preview pool is dating members only. */
  target_mode: string | null;
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
    const ids = existing.served_profile_ids as string[];
    const shared = {
      radiusUsedMi: existing.radius_used_mi,
      radiusExpanded: existing.radius_used_mi > memberRadiusMi,
      memberRadiusMi,
    };
    return existing.is_preview
      ? { preview: true, cards: await loadPreviewCards(ids), ...shared }
      : { preview: false, cards: await loadCards(ids), ...shared };
  }

  const { data: rows } = await supabase.rpc("drop_candidates", {
    p_max_radius_mi: RADIUS.maxMi,
  });

  // A preview is a preview OF DATING MEMBERS.
  //
  // visible_profiles returns both modes to a support-only viewer — deliberately,
  // so support-only members can find each other (Decision #18) — and those
  // profiles could take the top three slots. loadPreviewCards then reads
  // preview_profiles, which requires mode = 'dating', so each support-only id
  // returned no row and was quietly dropped by a .filter(Boolean). Nothing
  // refilled the slot, so a Preview Drop came back short, or empty, while real
  // dating members sat unranked. Filtering the POOL is what keeps the count
  // honest; filtering the render never could.
  const allRows = (rows ?? []) as CandidateRow[];
  const candidateRows = preview ? allRows.filter((r) => r.target_mode === "dating") : allRows;

  // The quiz reaches the Drop.
  //
  // This used to hardcode `quizVector: null` for every candidate AND for the
  // viewer, so quizCompat returned NEUTRAL for all of them — a constant, which
  // cancels out of the ranking entirely. Onboarding asked twelve questions,
  // stored a trait vector, and nothing ever read it: 30% of the score under the
  // launch weights was doing nothing at all. The migration comment that excused
  // it said "QUIZ_QUESTIONS is currently empty", which stopped being true when
  // the twelve questions landed.
  //
  // Read with the SERVICE client, deliberately. quiz_responses is own-rows-only
  // and should stay that way — returning vectors from the member-callable
  // drop_candidates RPC would let anyone read other members' trait scores by
  // calling it directly. This runs server-side, the vectors never reach the
  // browser, and only the ids of the chosen cards leave this function.
  const vectorIds = [userId, ...candidateRows.map((r) => r.id)];
  const { data: vectorRows } = await serviceClient()
    .from("quiz_responses")
    .select("user_id, trait_vector")
    .in("user_id", vectorIds);

  const vectors = new Map<string, readonly number[] | null>();
  for (const row of (vectorRows ?? []) as { user_id: string; trait_vector: number[] | null }[]) {
    // An empty array is a skipped quiz, which quizCompat must see as absent
    // rather than as a vector of zeroes.
    vectors.set(row.user_id, row.trait_vector?.length ? row.trait_vector : null);
  }

  const candidates = candidateRows.map((row) => ({
    id: row.id,
    distanceMi: row.distance_mi ?? Number.POSITIVE_INFINITY,
    intention: (row.intention ?? "open_to_either") as never,
    quizVector: vectors.get(row.id) ?? null,
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

  // §7.3 — hot-read, not compiled in. An admin changing the weights should
  // change tonight's Drop.
  const config = await dropConfig();

  const result = dropLogic.selectDrop(
    {
      intention: (profile?.intention ?? "open_to_either") as never,
      quizVector: vectors.get(userId) ?? null,
      radiusMi: memberRadiusMi,
      mode: preview ? "support_only" : "dating",
    },
    candidates,
    now.getTime(),
    config,
  );

  const servedIds = result.cards.map((c) => c.id);

  // Through record_drop, because members hold SELECT on drops and nothing else.
  //
  // This was a plain insert with the member's own client. It failed with 42501
  // every single time and the result was never checked — so no Drop was ever
  // recorded, Decision #15's free drop-connect (which validates source='drop'
  // against served_profile_ids) could never apply, and re-opening the app rolled
  // an entirely new Drop because the "already served today" read found nothing.
  //
  // The error is destructured now. A Drop that cannot be recorded is still shown
  // — the member should not lose their evening to our bookkeeping — but it is
  // reported rather than swallowed.
  const { error: recordError } = await supabase.rpc("record_drop", {
    p_drop_date: dropDate,
    p_served_profile_ids: servedIds,
    p_radius_used_mi: result.radiusUsedMi,
    p_is_preview: result.preview,
  });
  if (recordError) {
    console.error(JSON.stringify({ at: "drop.record", problem: recordError.message }));
  }

  const shared = {
    radiusUsedMi: result.radiusUsedMi,
    radiusExpanded: result.radiusExpanded,
    memberRadiusMi,
  };

  return result.preview
    ? { preview: true, cards: await loadPreviewCards(servedIds), ...shared }
    : { preview: false, cards: await loadCards(servedIds), ...shared };
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
    .select("id, display_name, age, intention, distance_mi, photo_privacy")
    .in("id", [...ids]);

  const byId = new Map((data ?? []).map((row) => [row.id as string, row]));

  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id as string,
      displayName: (row.display_name as string | null) ?? "Someone",
      age: row.age as number | null,
      intention: row.intention as string | null,
      distanceMi: row.distance_mi as number | null,
      photoPrivacy: row.photo_privacy as string | null,
    }));
}

/**
 * The Preview Drop path (Decision #19).
 *
 * Reads `preview_profiles`, which redacts in SQL — a support-only member cannot
 * see a name or an exact distance because the query never returns them. The
 * earlier version of this read `visible_profiles` and hid the name in the
 * component, which is the "blurred image with the real name in the payload"
 * that the view's own comment warns is not a redaction at all.
 */
async function loadPreviewCards(ids: readonly string[]): Promise<readonly PreviewCard[]> {
  if (ids.length === 0) return [];

  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("preview_profiles")
    .select("id, age_band, intention, distance_bucket_mi")
    .in("id", [...ids]);

  const byId = new Map((data ?? []).map((row) => [row.id as string, row]));

  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id as string,
      ageBand: row.age_band as string | null,
      intention: row.intention as string | null,
      distanceBucketMi: row.distance_bucket_mi as number | null,
    }));
}
