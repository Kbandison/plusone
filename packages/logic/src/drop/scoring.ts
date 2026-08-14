import type { Intention } from "../modes/types";

/**
 * How well two intentions sit together.
 *
 * Every pair is above zero on purpose. §6.1: "never a hard wall between dating
 * intentions". People change their minds, and a matrix with a zero in it is a
 * wall that pretends to be a preference — it would quietly make some members
 * invisible to each other forever.
 *
 * Symmetric: A wanting B is exactly as compatible as B wanting A.
 */
export const INTENTION_AFFINITY: Record<Intention, Record<Intention, number>> = {
  long_term: { long_term: 1, open_to_either: 0.75, casual: 0.3, friends_support: 0.2 },
  open_to_either: { long_term: 0.75, open_to_either: 1, casual: 0.75, friends_support: 0.4 },
  casual: { long_term: 0.3, open_to_either: 0.75, casual: 1, friends_support: 0.2 },
  friends_support: { long_term: 0.2, open_to_either: 0.4, casual: 0.2, friends_support: 1 },
};

export function intentionCompat(a: Intention, b: Intention): number {
  return INTENTION_AFFINITY[a][b];
}

/**
 * Cosine similarity, rescaled to 0..1.
 *
 * A skipped quiz scores NEUTRAL rather than zero. §7.2 makes the quiz
 * skippable, and scoring a skip as total incompatibility would make it
 * compulsory in everything but name.
 */
export const NEUTRAL_QUIZ_COMPAT = 0.5;

export function quizCompat(
  a: readonly number[] | null,
  b: readonly number[] | null,
): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return NEUTRAL_QUIZ_COMPAT;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  if (magA === 0 || magB === 0) return NEUTRAL_QUIZ_COMPAT;

  const cosine = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  return Math.min(1, Math.max(0, (cosine + 1) / 2));
}

/** 1 for someone active right now, falling to 0 at the activity cutoff. */
export function recencyActive(lastActiveAt: number, now: number, withinDays: number): number {
  const windowMs = withinDays * 24 * 60 * 60 * 1000;
  const age = now - lastActiveAt;
  if (age <= 0) return 1;
  if (age >= windowMs) return 0;
  return 1 - age / windowMs;
}

/**
 * Counters winner-take-all (§6.1). Without it the same handful of profiles win
 * every drop in a small city, and everyone else concludes the app is empty.
 */
export function underexposure(timesServed: number): number {
  return 1 / (1 + Math.max(0, timesServed));
}
