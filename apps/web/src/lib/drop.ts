import "server-only";

import { DROP, RADIUS, promptQuestion } from "@plusone/config";
import { drop as dropLogic } from "@plusone/logic";

import { serviceClient } from "./cron";
import { getServerSupabase } from "./supabase";
import { dropConfig } from "./tunables";

/** Candidates whose quiz vectors are fetched. Beyond this the ranking is already decided. */
const MAX_VECTOR_LOOKUP = 400;

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
  /**
   * Decision #19's compat%, on a whole percent. Null when it cannot be computed
   * — an unknown intention, say — because a card must not invent one.
   */
  readonly compatibility: number | null;
  /**
   * One answered prompt, so the card carries something the person actually
   * said. Everything else on it is a measurement of them.
   */
  readonly prompt: { readonly question: string; readonly answer: string } | null;
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
  /** §6.1 step 5 names compat% among the things a preview card DOES show. */
  readonly compatibility: number | null;
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
      /**
       * How many people were in the pool. Decision #19 puts density stats on
       * the Preview screen, and this is the honest denominator behind them —
       * "three of eleven nearby" says something a bare three does not.
       */
      readonly poolSize: number;
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

/**
 * The subset of `ids` the viewer has no connect with, in either direction.
 *
 * One query rather than a per-card check: a Drop is three to five cards, and
 * five round trips to answer one question is five chances for one of them to be
 * the slow one.
 */
async function withoutConnected(userId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const supabase = await getServerSupabase();

  const { data } = await supabase
    .from("connects")
    .select("initiator_id, target_id")
    .or(`initiator_id.eq.${userId},target_id.eq.${userId}`);

  const connected = new Set(
    (data ?? []).map((row) =>
      (row.initiator_id as string) === userId
        ? (row.target_id as string)
        : (row.initiator_id as string),
    ),
  );
  return ids.filter((id) => !connected.has(id));
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
    // Anyone connected with since this Drop was built comes out of it.
    //
    // isEligible already refuses alreadyConnected candidates — and never ran
    // again, because a stored Drop is replayed from served_profile_ids rather
    // than rebuilt. So sending a connect left the card sitting there for the
    // rest of the day, offering to do the thing you had just done.
    //
    // The stored row is not rewritten. It is the record of what was served, and
    // times_served and the suppression window are both counted off it; editing
    // it to tidy the screen would quietly rewrite what the system believes it
    // showed you.
    const ids = await withoutConnected(userId, existing.served_profile_ids as string[]);
    const shared = {
      radiusUsedMi: existing.radius_used_mi,
      radiusExpanded: existing.radius_used_mi > memberRadiusMi,
      memberRadiusMi,
    };
    // Redaction follows the member's CURRENT mode, not the mode they were in
    // when the row was written. Branching on existing.is_preview meant somebody
    // who switched to support-only after their Drop was built kept getting full
    // cards and clear photos for the rest of the day — and that branch only
    // became reachable at all once record_drop started working this morning.
    // The stored flag still stands as the record of what was served.
    const compat = await compatibilityFor(userId, profile?.intention ?? "open_to_either", ids);
    if (!preview) return { preview: false, cards: await loadCards(ids, compat), ...shared };

    // Counted now rather than stored with the Drop. The stat answers "how many
    // people are near me", which is a fact about tonight rather than about the
    // moment this row was written — and a member watching it is watching the
    // pool grow, which is the entire argument for switching modes.
    const { data: poolRows } = await supabase.rpc("drop_candidates", {
      p_max_radius_mi: existing.radius_used_mi,
    });
    return {
      preview: true,
      cards: await loadPreviewCards(ids, compat),
      poolSize: ((poolRows ?? []) as CandidateRow[]).filter((r) => r.target_mode === "dating")
        .length,
      ...shared,
    };
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
  // Bounded, and the error is not discarded. An unbounded `in` list grows with
  // the candidate pool and a failure here silently reverts every candidate to a
  // neutral quiz score — which is the exact bug this read was written to fix,
  // returning in a quieter form.
  const vectorIds = [userId, ...candidateRows.slice(0, MAX_VECTOR_LOOKUP).map((r) => r.id)];
  const { data: vectorRows, error: vectorError } = await serviceClient()
    .from("quiz_responses")
    .select("user_id, trait_vector")
    .in("user_id", vectorIds);

  if (vectorError) {
    console.error(JSON.stringify({ at: "drop.quiz_vectors", problem: vectorError.message }));
  }

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
  // An EMPTY drop is not recorded, and that is the difference between a quiet
  // evening and a lost day.
  //
  // The row is what makes a Drop stick: the read at the top of this function
  // returns it verbatim for the rest of the member's local day. Writing one
  // with no ids froze "nobody nearby" in place — a member who opened the app at
  // one minute past midnight, before anybody within their radius had been
  // verified, got an empty Drop and then kept getting it until tomorrow, while
  // people they could have met sat one query away.
  //
  // Nothing depends on the empty row either. It exists to stop a re-roll and to
  // let Decision #15's free connect check `source = 'drop'` against the ids it
  // holds, and neither applies to a Drop with nothing in it.
  if (servedIds.length > 0) {
    const { error: recordError } = await supabase.rpc("record_drop", {
      p_drop_date: dropDate,
      p_served_profile_ids: servedIds,
      p_radius_used_mi: result.radiusUsedMi,
      p_is_preview: result.preview,
    });
    if (recordError) {
      console.error(JSON.stringify({ at: "drop.record", problem: recordError.message }));
    }
  }

  const shared = {
    radiusUsedMi: result.radiusUsedMi,
    radiusExpanded: result.radiusExpanded,
    memberRadiusMi,
  };

  const compat = await compatibilityFor(userId, profile?.intention ?? "open_to_either", servedIds);
  return result.preview
    ? {
        preview: true,
        cards: await loadPreviewCards(servedIds, compat),
        poolSize: result.poolSize,
        ...shared,
      }
    : { preview: false, cards: await loadCards(servedIds, compat), ...shared };
}

/**
 * Re-reads the served profiles through `visible_profiles`, so a member who
 * blocks someone after the drop was built stops seeing them immediately. The
 * stored ids are a record of what was chosen, never a bypass of the wall.
 */
/**
 * The compatibility percentage for each served profile.
 *
 * Computed HERE rather than taken from selectDrop's `parts`, and used by both
 * paths, because the two must not be able to disagree — a member who reopens
 * the app must not see a different number from the one they saw at eight.
 *
 * selectDrop's score is also the wrong number to show. It mixes in recency and
 * underexposure, which say nothing about these two people: underexposure exists
 * to stop the same faces winning every night, so a card would read "82%
 * compatible" partly because that person had not been served lately. See
 * `compatibility` in packages/logic, which takes the person-to-person half
 * alone.
 *
 * Vectors are read with the SERVICE client for the same reason the ranking
 * does: quiz_responses is own-rows-only and must stay that way. They are used
 * to produce one integer per card and never leave this function.
 */
async function compatibilityFor(
  viewerId: string,
  viewerIntention: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const result = new Map<string, number>();
  if (ids.length === 0) return result;

  const supabase = await getServerSupabase();
  const [{ data: rows }, { data: vectorRows, error: vectorError }] = await Promise.all([
    supabase
      .from("visible_profiles")
      .select("id, intention")
      .in("id", [...ids]),
    serviceClient()
      .from("quiz_responses")
      .select("user_id, trait_vector")
      .in("user_id", [viewerId, ...ids]),
  ]);

  if (vectorError) {
    console.error(JSON.stringify({ at: "drop.compat_vectors", problem: vectorError.message }));
  }

  const vectors = new Map<string, readonly number[] | null>();
  for (const row of (vectorRows ?? []) as { user_id: string; trait_vector: number[] | null }[]) {
    // An empty array is a skipped quiz, which must read as absent rather than
    // as a vector of zeroes — the same distinction the ranking makes.
    vectors.set(row.user_id, row.trait_vector?.length ? row.trait_vector : null);
  }

  const viewer = {
    intention: viewerIntention as never,
    quizVector: vectors.get(viewerId) ?? null,
  };

  for (const row of (rows ?? []) as { id: string; intention: string | null }[]) {
    // No intention means no honest number, and a card must not invent one.
    if (!row.intention) continue;
    result.set(
      row.id,
      dropLogic.compatibilityPercent(
        dropLogic.compatibility(
          viewer,
          { intention: row.intention as never, quizVector: vectors.get(row.id) ?? null },
          DROP.weights,
        ),
      ),
    );
  }

  return result;
}

async function loadCards(
  ids: readonly string[],
  compat: ReadonlyMap<string, number>,
): Promise<readonly DropCard[]> {
  if (ids.length === 0) return [];

  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("visible_profiles")
    .select("id, display_name, age, intention, distance_mi, photo_privacy, prompts")
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
      compatibility: compat.get(row.id as string) ?? null,
      prompt: firstPrompt(row.prompts),
    }));
}

/**
 * The first prompt a member actually answered.
 *
 * A card built only from measurements — a name, an age, a distance, a badge —
 * is a search result. One sentence in their own words is the difference between
 * deciding about a row and deciding about a person, and Decision #14 already
 * makes the reply-to-a-prompt the way a connect starts, so this is the thing
 * the next screen asks them about.
 *
 * Defensive about the shape because `prompts` is jsonb: an id nobody recognises
 * or an empty answer is skipped rather than rendered as a blank quotation.
 */
function firstPrompt(value: unknown): { question: string; answer: string } | null {
  if (!Array.isArray(value)) return null;

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { id, answer } = entry as { id?: unknown; answer?: unknown };
    if (typeof id !== "string" || typeof answer !== "string" || answer.trim() === "") continue;

    const question = promptQuestion(id);
    if (question) return { question, answer: answer.trim() };
  }
  return null;
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
async function loadPreviewCards(
  ids: readonly string[],
  compat: ReadonlyMap<string, number>,
): Promise<readonly PreviewCard[]> {
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
      compatibility: compat.get(row.id as string) ?? null,
    }));
}
