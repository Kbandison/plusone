/**
 * Mode and intention switching (§6.4, Decisions #8 and #20).
 *
 * Two structural properties this module exists to guarantee:
 *
 *   1. LEAVING DATING IS NEVER GATED. `switchMode` to support_only cannot fail —
 *      there is no branch that refuses it and no config value that could. A
 *      cooldown on the way out would mean holding someone in a dating pool they
 *      have asked to leave, and support-only is a shield (Decision #18), not a
 *      privilege.
 *
 *   2. THE RE-ENTRY COOLDOWN CANNOT BE FLICKERED AWAY. Every departure from
 *      dating re-arms the clock, so alternating modes never shortens it.
 *      Decision #20 exists because a shield you can drop and raise at will is
 *      not a shield.
 */

export type MemberMode = "dating" | "support_only";

export type Intention = "long_term" | "open_to_either" | "casual" | "friends_support";

export const INTENTIONS = [
  "long_term",
  "open_to_either",
  "casual",
  "friends_support",
] as const satisfies readonly Intention[];

export interface ModeState {
  readonly mode: MemberMode;
  readonly intention: Intention;
  /** Epoch ms of the last intention change. Set on the first choice too. */
  readonly intentionChangedAt: number;
  /**
   * Epoch ms from which dating may be re-entered. Null means the member has
   * never left dating, which is the only case that is instant.
   */
  readonly datingReentryAt: number | null;
}

export type ModeErrorCode =
  | "intention_locked"
  | "already_that_intention"
  | "already_that_mode"
  | "dating_reentry_locked";

export type ModeResult =
  | { readonly ok: true; readonly state: ModeState }
  | { readonly ok: false; readonly code: ModeErrorCode; readonly unlocksAt?: number };

export interface ModeConfig {
  readonly intentionChangeDays: number;
  readonly datingReentryDays: number;
}
