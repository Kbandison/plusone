/**
 * The connect economy (§6.3, Decisions #15 and #18).
 *
 * Two structural properties this module exists to guarantee:
 *
 *   1. A DROP CONNECT ALWAYS COSTS NOTHING. Not "costs nothing today" — the
 *      cost of a drop connect is not a function of premium, of budget, or of
 *      anything else. The curated three are the product; charging for them
 *      would turn the mechanic that makes this app different into the one that
 *      makes it the same. `costOf` cannot see whether a member pays.
 *
 *   2. PREMIUM RAISES THE CAP AND NEVER REMOVES IT. There is no unlimited
 *      value, no null, no sentinel — `dailyAllowance` returns a number, and the
 *      largest one in the config is ten. Unlimited initiation is the mechanic
 *      that produces the inbox nobody reads.
 *
 * A support-only member cannot initiate from the drop or from browse at all
 * (Decision #18). That is not a budget of zero, which could be topped up; those
 * sources are simply not available to them.
 */

export type ConnectSource = "drop" | "browse" | "room";

export const CONNECT_SOURCES = [
  "drop",
  "browse",
  "room",
] as const satisfies readonly ConnectSource[];

export interface ConnectBudgetState {
  readonly mode: "dating" | "support_only";
  readonly isPremium: boolean;
  /** Budget units already spent in the member's current local day. */
  readonly spentToday: number;
  /** Room-scoped connects sent in the current rolling week. */
  readonly roomSentThisWeek: number;
}

export type ConnectErrorCode =
  "source_unavailable_in_support_only" | "daily_budget_exhausted" | "weekly_room_budget_exhausted";

export type ConnectCheck =
  | { readonly ok: true; readonly cost: number }
  | { readonly ok: false; readonly code: ConnectErrorCode; readonly resetsIn: "day" | "week" };

export interface ConnectConfig {
  readonly freePerDay: number;
  readonly premiumPerDay: number;
  readonly dropConnectCost: number;
  readonly browseConnectCost: number;
  readonly supportOnlyPerWeek: number;
  readonly pendingExpiryDays: number;
}

/** The lifecycle of a connect, as `connects.status` stores it. */
export type ConnectStatus = "pending" | "accepted" | "declined" | "expired";

/**
 * What a directory row should say about somebody you already have history with.
 *
 * Deliberately coarser than the status it is derived from. "declined" is a
 * decision one person made about another and saying so on a browsable card
 * would publish it back at them every time they scrolled past — see
 * `historyWith`.
 */
export type ConnectionState = "none" | "waiting_on_you" | "waiting_on_them" | "talking" | "past";
