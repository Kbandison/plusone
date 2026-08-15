import { COOLDOWNS } from "@plusone/config";

import type { Intention, MemberMode, ModeConfig, ModeResult, ModeState } from "./types";

export const DEFAULT_MODE_CONFIG: ModeConfig = {
  intentionChangeDays: COOLDOWNS.intentionChangeDays,
  datingReentryDays: COOLDOWNS.datingReentryDays,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const days = (n: number) => n * DAY_MS;

/** When the member may next change intention. */
export function intentionUnlocksAt(
  state: ModeState,
  config: ModeConfig = DEFAULT_MODE_CONFIG,
): number {
  return state.intentionChangedAt + days(config.intentionChangeDays);
}

/**
 * §6.4 — changeable once every 30 days, "so it means something" (§3.4). An
 * intention that can be edited hourly tells a reader nothing, which is the
 * whole reason for the lock.
 */
export function changeIntention(
  state: ModeState,
  next: Intention,
  at: number,
  config: ModeConfig = DEFAULT_MODE_CONFIG,
): ModeResult {
  // Re-selecting the current intention does not spend the cooldown. Charging
  // someone thirty days for touching a control and changing nothing would be a
  // trap rather than a lock.
  if (next === state.intention) return { ok: false, code: "already_that_intention" };

  // NaN < anything is false, so a non-finite clock read as "cooldown passed"
  // and then WROTE itself into intentionChangedAt — after which every later
  // comparison against NaN was also false and the 30-day lock was gone for
  // good. A cooldown that a bad timestamp permanently unlocks is not a cooldown.
  const unlocksAt = intentionUnlocksAt(state, config);
  if (!Number.isFinite(at) || at < unlocksAt) {
    return { ok: false, code: "intention_locked", unlocksAt };
  }

  return { ok: true, state: { ...state, intention: next, intentionChangedAt: at } };
}

/**
 * §6.4 — mode switching.
 *
 * To support_only: always allowed. There is deliberately no condition on this
 * branch; see the note at the top of types.ts.
 *
 * To dating: instant only if the member has never left dating. Every departure
 * arms `datingReentryAt`, so the cooldown restarts each time rather than
 * accumulating credit.
 */
export function switchMode(
  state: ModeState,
  target: MemberMode,
  at: number,
  config: ModeConfig = DEFAULT_MODE_CONFIG,
): ModeResult {
  if (target === state.mode) return { ok: false, code: "already_that_mode" };

  if (target === "support_only") {
    return {
      ok: true,
      state: {
        ...state,
        mode: "support_only",
        datingReentryAt: at + days(config.datingReentryDays),
      },
    };
  }

  if (state.datingReentryAt !== null && at < state.datingReentryAt) {
    return { ok: false, code: "dating_reentry_locked", unlocksAt: state.datingReentryAt };
  }

  return { ok: true, state: { ...state, mode: "dating" } };
}

/** Whether dating can be re-entered right now. */
export function canReturnToDating(state: ModeState, at: number): boolean {
  return (
    state.mode === "support_only" && (state.datingReentryAt === null || at >= state.datingReentryAt)
  );
}

/** Whether this member is hidden from all dating surfaces (Decision #18). */
export function isShielded(state: ModeState): boolean {
  return state.mode === "support_only";
}
