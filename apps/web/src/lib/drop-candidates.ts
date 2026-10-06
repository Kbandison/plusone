import { RADIUS } from "@plusone/config";
import { drop as dropLogic } from "@plusone/logic";

/**
 * How far the Drop looks on a member's behalf — the ladder's top rung.
 *
 * One number for the two readers that must agree on it: the Drop, which
 * fetches its candidates out to here, and the cron that decides whether there
 * is a Drop worth announcing.
 *
 * They did not agree. a90f617 raised the ladder to 350 to rescue members with
 * nobody inside 250, and the Drop kept fetching at `RADIUS.maxMi` — 250, the
 * furthest a member may CHOOSE, which is a different question. So the 350 rung
 * climbed over a pool that stopped at 250 and could never add anybody, while
 * the notification looked out to 350 and announced people the Drop could not
 * reach.
 */
export const DROP_REACH_MI = Math.max(...RADIUS.ladderMi);

/**
 * The columns of `drop_candidates` the eligibility rule and the ranking read.
 * `drop_candidates_for` returns exactly these, plus whose candidate it is.
 */
export interface CandidateRow {
  readonly id: string;
  readonly intention: string | null;
  readonly last_active_at: string;
  readonly distance_mi: number | null;
  readonly times_served: number | string;
  readonly already_connected: boolean;
  readonly last_served_to_viewer_at: string | null;
}

/**
 * Rows as `selectDrop` takes them. Shared by the Drop and the cron, so the
 * notification is decided on the same candidates the Drop is built from.
 */
export function toDropCandidates(
  rows: readonly CandidateRow[],
  vectors: ReadonlyMap<string, readonly number[] | null> = new Map(),
): dropLogic.DropCandidate[] {
  return rows.map((row) => ({
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
}

/**
 * Would tonight's Drop show this member anybody?
 *
 * `selectDrop` itself, not a summary of it. The last version of this question
 * was asked in SQL of `drop_candidates`, which applies the walls and RETURNS
 * already-connected, last-active and last-served as columns for `isEligible`
 * to filter — so it answered yes for a member who had met or been shown
 * everybody in reach, and the push opened onto an empty screen. Asking the
 * function that builds the Drop is the only answer that cannot drift from it.
 *
 * No quiz vectors: they reorder the pool and never change whether it is empty.
 */
export function wouldHaveDrop(
  viewer: { readonly intention: string | null; readonly radiusMi: number | null },
  rows: readonly CandidateRow[],
  now: number,
  config: dropLogic.DropConfig,
): boolean {
  const result = dropLogic.selectDrop(
    {
      intention: (viewer.intention ?? "open_to_either") as never,
      quizVector: null,
      radiusMi: viewer.radiusMi ?? RADIUS.defaultMi,
      // Only dating members are ever due — see drop_notification_due.
      mode: "dating",
    },
    toDropCandidates(rows),
    now,
    config,
  );
  return result.cards.length > 0;
}
