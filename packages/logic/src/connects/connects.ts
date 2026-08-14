import { CONNECTS } from "@plusone/config";

import type {
  ConnectBudgetState,
  ConnectCheck,
  ConnectConfig,
  ConnectSource,
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
export function costOf(source: ConnectSource, config: ConnectConfig = DEFAULT_CONNECT_CONFIG): number {
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

/** Budget units left today. Never negative. */
export function remainingToday(
  state: ConnectBudgetState,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): number {
  return Math.max(0, dailyAllowance(state, config) - state.spentToday);
}

export function remainingRoomConnectsThisWeek(
  state: ConnectBudgetState,
  config: ConnectConfig = DEFAULT_CONNECT_CONFIG,
): number {
  return Math.max(0, config.supportOnlyPerWeek - state.roomSentThisWeek);
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
    return { ...state, roomSentThisWeek: state.roomSentThisWeek + 1 };
  }
  return { ...state, spentToday: state.spentToday + costOf(source, config) };
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
