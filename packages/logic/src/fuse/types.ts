/**
 * The fuse (§6.2, Decision #13).
 *
 * Every chat has 7 days to turn into a plan. If it doesn't, it closes kindly —
 * for both of you. Nobody here gets left on read.
 *
 * Two structural properties this module exists to guarantee:
 *
 *   1. NOTHING EXTENDS THE FUSE. There is no `extend` event in FuseEvent and
 *      there never will be. Selling exemptions from mechanics is banned outright
 *      (§3.3, Decision #24), and the cheapest way to keep that promise is to make
 *      the extension unrepresentable rather than merely unpurchased.
 *
 *   2. NO CHAT ENDS IN SILENCE. Every terminal state either carries a closure
 *      note or is `graduated` — the outcome where two people actually met.
 */

export type ChatStatus =
  | "open"
  | "date_planned"
  | "closed_fuse"
  | "closed_by_member"
  | "graduated";

export const TERMINAL_STATUSES = ["closed_fuse", "closed_by_member", "graduated"] as const;

/** A plan is concrete or it is not a plan: date + rough time + place-or-video. */
export interface DatePlan {
  readonly date: string;
  readonly time: string;
  readonly place: string;
}

export interface PlanState {
  readonly plan: DatePlan;
  readonly proposedBy: string;
  /** Null until the OTHER participant confirms. */
  readonly confirmedBy: string | null;
}

export interface ClosureState {
  /** Index into CLOSURE_TEMPLATES. Always present on a closed chat. */
  readonly template: number;
  /** Optional, max 140 chars, tone-checked upstream by logic/tone. */
  readonly personalLine: string | null;
  /** Null when the fuse closed it rather than a person. */
  readonly closedBy: string | null;
  readonly closedAt: number;
}

export interface FuseState {
  readonly status: ChatStatus;
  /** Epoch ms. Null exactly when the chat is date_planned or terminal. */
  readonly fuseExpiresAt: number | null;
  readonly plan: PlanState | null;
  readonly closure: ClosureState | null;
}

export type FuseEvent =
  | { readonly type: "open"; readonly at: number }
  | { readonly type: "propose_plan"; readonly by: string; readonly plan: DatePlan; readonly at: number }
  | { readonly type: "confirm_plan"; readonly by: string; readonly at: number }
  | { readonly type: "cancel_plan"; readonly at: number }
  | {
      readonly type: "close";
      readonly by: string;
      readonly template: number;
      readonly personalLine?: string | null;
      readonly at: number;
    }
  /** The cron sweep. Closes anything whose fuse has burned down. */
  | { readonly type: "sweep"; readonly at: number }
  /** Both people met. The happy terminal state. */
  | { readonly type: "graduate"; readonly at: number };

export type FuseErrorCode =
  | "already_closed"
  | "not_open"
  | "no_plan"
  | "plan_incomplete"
  | "needs_other_participant"
  | "no_confirmed_plan"
  | "not_expired"
  | "invalid_template"
  | "personal_line_too_long";

export type FuseResult =
  | { readonly ok: true; readonly state: FuseState }
  | { readonly ok: false; readonly code: FuseErrorCode };

export interface FuseConfig {
  readonly windowHours: number;
  readonly reArmHoursAfterCancelledPlan: number;
  readonly warningHoursBeforeExpiry: number;
  readonly personalLineMaxChars: number;
  readonly templateCount: number;
}
