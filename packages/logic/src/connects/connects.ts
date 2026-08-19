import { CONNECTS } from "@plusone/config";

import type {
  ConnectBudgetState,
  ConnectCheck,
  ConnectConfig,
  ConnectSource,
  ConnectionState,
  ConnectStatus,
} from "./types";

export const DEFAULT_CONNECT_CONFIG: ConnectConfig = {
  freePerDay: CONNECTS.freePerDay,
  premiumPerDay: CONNECTS.premiumPerDay,
  dropConnectCost: CONNECTS.dropConnectCost,
  browseConnectCost: CONNECTS.browseConnectCost,
  supportOnlyPerWeek: CONNECTS.supportOnlyPerWeek,
  pendingExpiryDays: CONNECTS.pendingExpiryDays,
};

/**
 * What a connect from this source costs.
 *
 * Note the signature: it takes the source and the config, and nothing about the
 * member. A drop connect cannot cost more for a free member or less for a
 * paying one because neither fact is in scope here.
 */
export function costOf(
  source: ConnectSource,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): number {
  switch (source) {
    case "drop":
      return config.dropConnectCost;
    case "browse":
    case "room":
      return config.browseConnectCost;
  }
}

/**
 * The daily cap. Always a number — there is no unlimited tier, and adding one
 * would mean changing this return type rather than adding a config value.
 */
export function dailyAllowance(
  state: ConnectBudgetState,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): number {
  return state.isPremium ? config.premiumPerDay : config.freePerDay;
}

/**
 * Whether a counter is a number of connects at all.
 *
 * Math.max(0, …) protected the OUTPUT and nothing validated the input, so
 * spentToday: NaN made remainingToday NaN, `NaN < 1` false, and the budget
 * unlimited — while spentToday: -100 inflated a 3/day allowance to 103.
 *
 * Both fail toward more unsolicited approaches, which in this community is a
 * safety question rather than a billing one, so an untrusted counter is read as
 * exhausted. A member wrongly told they are out of connects for the day can say
 * so; the people on the other end of an unlimited budget cannot.
 */
const isCount = (value: number): boolean => Number.isFinite(value) && value >= 0;

/** Budget units already spent. Anything we cannot read is all of them. */
const spent = (value: number): number => (isCount(value) ? value : Infinity);

/** Budget units left today. Never negative. */
export function remainingToday(
  state: ConnectBudgetState,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): number {
  return Math.max(0, dailyAllowance(state, config) - spent(state.spentToday));
}

export function remainingRoomConnectsThisWeek(
  state: ConnectBudgetState,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): number {
  return Math.max(0, config.supportOnlyPerWeek - spent(state.roomSentThisWeek));
}

/**
 * Whether this member may send a connect from this source right now.
 *
 * The authoritative version of this runs as a trigger on every insert into
 * `connects`, whatever path it arrives by. This is the same rule stated where a
 * screen can grey out a button and say why — it is not the enforcement.
 */
export function canSendConnect(
  state: ConnectBudgetState,
  source: ConnectSource,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): ConnectCheck {
  const cost = costOf(source, config);

  if (state.mode === "support_only") {
    // Decision #18 — outbound is room-scoped and weekly. Drop and browse are
    // not budgeted at zero, they are absent: a budget can be topped up and this
    // must not be.
    if (source !== "room") {
      return { ok: false, code: "source_unavailable_in_support_only", resetsIn: "week" };
    }
    if (remainingRoomConnectsThisWeek(state, config) <= 0) {
      return { ok: false, code: "weekly_room_budget_exhausted", resetsIn: "week" };
    }
    return { ok: true, cost: 0 };
  }

  // Free by construction, so it never touches the budget it does not spend.
  if (cost === 0) return { ok: true, cost: 0 };

  if (remainingToday(state, config) < cost) {
    return { ok: false, code: "daily_budget_exhausted", resetsIn: "day" };
  }

  return { ok: true, cost };
}

/** Applies a sent connect to the budget. */
export function spend(
  state: ConnectBudgetState,
  source: ConnectSource,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): ConnectBudgetState {
  if (state.mode === "support_only") {
    // Only a room connect is spendable here — canSendConnect refuses every
    // other source outright, so charging the weekly budget for one would burn
    // a support-only member's allowance on an ask that never went out.
    if (source !== "room") return state;
    // A corrupt counter is written back as exhausted rather than as Infinity —
    // it has to survive a round trip through the database, and "you are out for
    // this week" is the same answer remainingToday already gives.
    const sent = isCount(state.roomSentThisWeek)
      ? state.roomSentThisWeek
      : config.supportOnlyPerWeek;
    return { ...state, roomSentThisWeek: sent + 1 };
  }
  const today = isCount(state.spentToday) ? state.spentToday : dailyAllowance(state, config);
  return { ...state, spentToday: today + costOf(source, config) };
}

/** Epoch ms at which an unanswered connect expires (§6.3). */
export function pendingExpiresAt(
  sentAt: number,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): number {
  return sentAt + config.pendingExpiryDays * 24 * 60 * 60 * 1000;
}

export function isPendingExpired(
  sentAt: number,
  now: number,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): boolean {
  return now >= pendingExpiresAt(sentAt, config);
}

/**
 * What Browse should say about a member you have history with.
 *
 * Browse listed everyone in range with no memory at all, so a member you had
 * connected with last week looked exactly like a stranger — and the connect
 * screen behind the card was the only thing that told you otherwise, after you
 * had already tapped through to it.
 *
 * A DECLINE SAYS NOTHING AT ALL. Not "declined", and not a softened "connected
 * before" either: both put a rejection on a card, one of them just wearing a
 * nicer word. §11's posture is that a decision about somebody is not a thing to
 * publish back at them, and Decision #26 rules out shame mechanics outright.
 *
 * The quiet is backed by a wall rather than by the silence. connect_permitted
 * refuses a fresh ask for cooldowns.decline_days, so a member who is told
 * nothing also cannot re-ask — which is the half that makes hiding it honest
 * instead of merely tidy.
 *
 * An expiry is different and is worth saying. Nobody decided anything: the ask
 * ran out unanswered, and either of them may want to try again.
 */
export function historyWith(
  status: ConnectStatus | null,
  viewerInitiated: boolean,
): ConnectionState {
  if (status === null) return "none";
  if (status === "pending") return viewerInitiated ? "waiting_on_them" : "waiting_on_you";
  if (status === "accepted") return "talking";
  if (status === "declined") return "none";
  return "past";
}
