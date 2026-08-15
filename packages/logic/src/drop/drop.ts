import { DROP, RADIUS } from "@plusone/config";

import { intentionCompat, quizCompat, recencyActive, underexposure } from "./scoring";
import type { DropCandidate, DropConfig, DropResult, DropViewer, ScoredCandidate } from "./types";

export const DEFAULT_DROP_CONFIG: DropConfig = {
  count: DROP.count,
  activeWithinDays: DROP.activeWithinDays,
  suppressRecentlyServedDays: DROP.suppressRecentlyServedDays,
  minPool: RADIUS.minPool,
  ladderMi: RADIUS.ladderMi,
  weights: DROP.weights,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * §6.1 step 1. Distance is deliberately not part of this — the ladder decides
 * the radius, and folding it in here would mean re-running every other filter
 * on each rung.
 */
export function isEligible(
  candidate: DropCandidate,
  now: number,
  config: DropConfig = DEFAULT_DROP_CONFIG,
): boolean {
  if (!candidate.verified) return false;
  if (candidate.blocked) return false;
  if (candidate.reportPending) return false;
  if (candidate.alreadyConnected) return false;
  if (now - candidate.lastActiveAt > config.activeWithinDays * DAY_MS) return false;
  if (
    candidate.lastServedToViewerAt !== null &&
    now - candidate.lastServedToViewerAt < config.suppressRecentlyServedDays * DAY_MS
  ) {
    return false;
  }
  return true;
}

export function score(
  viewer: DropViewer,
  candidate: DropCandidate,
  now: number,
  config: DropConfig = DEFAULT_DROP_CONFIG,
): ScoredCandidate {
  const parts = {
    intentionCompat: intentionCompat(viewer.intention, candidate.intention),
    quizCompat: quizCompat(viewer.quizVector, candidate.quizVector),
    recencyActive: recencyActive(candidate.lastActiveAt, now, config.activeWithinDays),
    underexposure: underexposure(candidate.timesServed),
  };

  const w = config.weights;
  const total = w.intentionCompat + w.quizCompat + w.recencyActive + w.underexposure;

  // Normalised by the weight total, so tuning one weight in the admin config
  // editor does not silently rescale every score in the system.
  const weighted =
    parts.intentionCompat * w.intentionCompat +
    parts.quizCompat * w.quizCompat +
    parts.recencyActive * w.recencyActive +
    parts.underexposure * w.underexposure;

  return { id: candidate.id, score: total === 0 ? 0 : weighted / total, parts };
}

/**
 * §6.1 step 2 — start at the member's own radius and climb only while the pool
 * is too thin.
 *
 * Returns the first radius that clears `minPool`, or the widest rung if none
 * does. Climbing is not a preference for distance: it is the difference between
 * an honest empty night and three padded cards.
 */
export function resolveRadius(
  eligible: readonly DropCandidate[],
  viewerRadiusMi: number,
  config: DropConfig = DEFAULT_DROP_CONFIG,
): { radiusMi: number; pool: readonly DropCandidate[] } {
  const rungs = [viewerRadiusMi, ...config.ladderMi.filter((mi) => mi > viewerRadiusMi)].sort(
    (a, b) => a - b,
  );

  let last = { radiusMi: rungs[0] ?? viewerRadiusMi, pool: [] as readonly DropCandidate[] };
  for (const radiusMi of rungs) {
    const pool = eligible.filter((c) => c.distanceMi <= radiusMi);
    last = { radiusMi, pool };
    if (pool.length >= config.minPool) return last;
  }
  return last;
}

/**
 * The whole drop, as one pure function.
 *
 * Note what is not a parameter: whether the viewer pays. Decision #11 — the
 * count is the same for everyone, and the way to keep that true is to make
 * paying invisible here.
 */
export function selectDrop(
  viewer: DropViewer,
  candidates: readonly DropCandidate[],
  now: number,
  config: DropConfig = DEFAULT_DROP_CONFIG,
): DropResult {
  // Nobody appears twice. Nothing upstream guarantees distinct rows, and a
  // duplicate took two of the three cards — the member sees the same person
  // twice and a real candidate is pushed out of a Drop that is only ever three.
  const seen = new Set<string>();
  const distinct = candidates.filter((c) => !seen.has(c.id) && seen.add(c.id));

  const eligible = distinct.filter((c) => isEligible(c, now, config));
  const { radiusMi, pool } = resolveRadius(eligible, viewer.radiusMi, config);

  const ranked = pool
    .map((c) => score(viewer, c, now, config))
    // A NaN score makes `b.score - a.score` NaN, which makes the comparator
    // non-total — and the poisoned candidate ends up served first rather than
    // last. Drop it instead of ranking it.
    .filter((c) => Number.isFinite(c.score))
    // Ties break by id so the same inputs always give the same drop — a member
    // who reloads must not see a different three.
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    // §6.1 step 4 — fewer if the pool is thin. `slice` takes what exists and
    // there is nowhere to pad from.
    cards: ranked.slice(0, config.count),
    radiusUsedMi: radiusMi,
    radiusExpanded: radiusMi > viewer.radiusMi,
    preview: viewer.mode === "support_only",
    poolSize: pool.length,
  };
}
