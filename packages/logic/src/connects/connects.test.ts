import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PREMIUM_NEVER } from "@plusone/config";

import {
  CONNECT_SOURCES,
  DEFAULT_CONNECT_CONFIG,
  canSendConnect,
  costOf,
  dailyAllowance,
  historyWith,
  isPendingExpired,
  pendingExpiresAt,
  remainingRoomConnectsThisWeek,
  remainingToday,
  spend,
  type ConnectBudgetState,
} from "./index";

const AT = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const member = (over: Partial<ConnectBudgetState> = {}): ConnectBudgetState => ({
  mode: "dating",
  isPremium: false,
  spentToday: 0,
  roomSentThisWeek: 0,
  ...over,
});

// The curated three are the product. Charging for them would turn the mechanic
// that makes this app different into the one that makes it the same.
describe("a drop connect always costs nothing", () => {
  it("costs zero for a free member and a paying one alike", () => {
    expect(costOf("drop")).toBe(0);
    expect(canSendConnect(member(), "drop")).toEqual({ ok: true, cost: 0 });
    expect(canSendConnect(member({ isPremium: true }), "drop")).toEqual({ ok: true, cost: 0 });
  });

  it("is still free with the daily budget completely spent", () => {
    const broke = member({ spentToday: 999 });
    expect(canSendConnect(broke, "drop")).toEqual({ ok: true, cost: 0 });
  });

  it("does not touch the budget it does not spend", () => {
    const after = spend(member({ spentToday: 2 }), "drop");
    expect(after.spentToday).toBe(2);
  });

  // costOf takes a source and a config. It cannot see whether the member pays,
  // so a paid drop connect is not something this code could express.
  it("cannot be made to depend on who is asking", () => {
    const source = readFileSync(fileURLToPath(new URL("./connects.ts", import.meta.url)), "utf8");
    const signature = /export function costOf\(([\s\S]*?)\): number/.exec(source)?.[1] ?? "";
    expect(signature).toContain("source");
    expect(signature).toContain("config");
    expect(signature).not.toMatch(/premium|state|member|viewer/i);
  });

  it("is one of the things premium never buys", () => {
    expect(PREMIUM_NEVER.join(" ").toLowerCase()).toContain("drop");
  });
});

describe("the daily budget", () => {
  it("is 3 free and 10 premium", () => {
    expect(dailyAllowance(member())).toBe(3);
    expect(dailyAllowance(member({ isPremium: true }))).toBe(10);
  });

  it("spends one unit per browse connect", () => {
    let state = member();
    for (let i = 0; i < 3; i++) {
      expect(canSendConnect(state, "browse").ok).toBe(true);
      state = spend(state, "browse");
    }
    expect(canSendConnect(state, "browse")).toMatchObject({
      ok: false,
      code: "daily_budget_exhausted",
      resetsIn: "day",
    });
  });

  it("lets premium send more, but not without end", () => {
    let state = member({ isPremium: true });
    for (let i = 0; i < 10; i++) state = spend(state, "browse");
    expect(canSendConnect(state, "browse").ok).toBe(false);
  });

  it("never reports a negative remainder", () => {
    expect(remainingToday(member({ spentToday: 99 }))).toBe(0);
  });

  // Unlimited initiation is the mechanic that produces the inbox nobody reads.
  // There is no value dailyAllowance could return to express it.
  it("has no unlimited tier to reach for", () => {
    const source = readFileSync(fileURLToPath(new URL("./connects.ts", import.meta.url)), "utf8");
    const fn = /export function dailyAllowance\([\s\S]*?\n\}/.exec(source)?.[0] ?? "";
    expect(fn).not.toMatch(/Infinity|null|undefined|unlimited|-1/i);
    expect(dailyAllowance(member({ isPremium: true }))).toBeLessThan(100);
  });
});

// Decision #18 — support-only outbound is room-scoped and weekly.
describe("support-only members", () => {
  const shielded = (over: Partial<ConnectBudgetState> = {}) =>
    member({ mode: "support_only", ...over });

  it.each(["drop", "browse"] as const)("cannot initiate from %s at all", (source) => {
    expect(canSendConnect(shielded(), source)).toMatchObject({
      ok: false,
      code: "source_unavailable_in_support_only",
    });
  });

  // A budget of zero could be topped up. These sources are absent, not empty.
  it("is not merely out of budget on those sources", () => {
    const premiumAndFresh = shielded({ isPremium: true, spentToday: 0 });
    expect(canSendConnect(premiumAndFresh, "browse")).toMatchObject({
      ok: false,
      code: "source_unavailable_in_support_only",
    });
  });

  it("may send three room connects a week", () => {
    let state = shielded();
    for (let i = 0; i < 3; i++) {
      expect(canSendConnect(state, "room").ok).toBe(true);
      state = spend(state, "room");
    }
    expect(canSendConnect(state, "room")).toMatchObject({
      ok: false,
      code: "weekly_room_budget_exhausted",
      resetsIn: "week",
    });
  });

  it("does not get more room connects for paying", () => {
    const paid = shielded({ isPremium: true, roomSentThisWeek: 3 });
    expect(canSendConnect(paid, "room").ok).toBe(false);
    expect(remainingRoomConnectsThisWeek(paid)).toBe(0);
  });

  it("spends the weekly count rather than the daily one", () => {
    const after = spend(shielded(), "room");
    expect(after.roomSentThisWeek).toBe(1);
    expect(after.spentToday).toBe(0);
  });
});

describe("pending connects expire kindly", () => {
  it("after seven days", () => {
    expect(pendingExpiresAt(AT)).toBe(AT + 7 * DAY);
    expect(isPendingExpired(AT, AT + 7 * DAY - 1)).toBe(false);
    expect(isPendingExpired(AT, AT + 7 * DAY)).toBe(true);
  });
});

describe("purity", () => {
  it("never mutates the state it is given", () => {
    const state = member();
    const snapshot = structuredClone(state);
    spend(state, "browse");
    canSendConnect(state, "drop");
    expect(state).toEqual(snapshot);
  });

  it.each(CONNECT_SOURCES)("gives %s a defined cost", (source) => {
    expect(Number.isFinite(costOf(source))).toBe(true);
  });

  it("uses the locked config defaults", () => {
    expect(DEFAULT_CONNECT_CONFIG.freePerDay).toBe(3);
    expect(DEFAULT_CONNECT_CONFIG.premiumPerDay).toBe(10);
    expect(DEFAULT_CONNECT_CONFIG.dropConnectCost).toBe(0);
    expect(DEFAULT_CONNECT_CONFIG.supportOnlyPerWeek).toBe(3);
  });
});

describe("historyWith", () => {
  it("says nothing about a stranger", () => {
    expect(historyWith(null, false)).toBe("none");
  });

  it("tells the two directions of a pending connect apart", () => {
    expect(historyWith("pending", true)).toBe("waiting_on_them");
    expect(historyWith("pending", false)).toBe("waiting_on_you");
  });

  it("knows when there is a conversation", () => {
    expect(historyWith("accepted", true)).toBe("talking");
    expect(historyWith("accepted", false)).toBe("talking");
  });

  /**
   * A decline is a decision one person made about another. Naming it on a card
   * publishes it back at them every time they scroll past, and there is nothing
   * a viewer can do with it either way — the connect is over.
   */
  it("never names a decline", () => {
    expect(historyWith("declined", true)).toBe("past");
    expect(historyWith("declined", false)).toBe("past");
  });

  it("treats an expiry the same as any other ending", () => {
    expect(historyWith("expired", true)).toBe("past");
    expect(historyWith("expired", false)).toBe("past");
  });
});
