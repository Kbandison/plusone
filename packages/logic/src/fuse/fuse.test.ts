import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CLOSURE_TEMPLATES } from "@plusone/config";

import {
  DEFAULT_FUSE_CONFIG,
  countdown,
  isPlanComplete,
  needsExpiryWarning,
  needsSweep,
  openChat,
  transition,
} from "./fuse";
import type { DatePlan, FuseEvent, FuseState } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 7, 13, 20, 0, 0); // a Drop lands at 8pm local

const ALICE = "alice";
const BOB = "bob";

const PLAN: DatePlan = { date: "2026-08-20", time: "evening", place: "Coffee on Mill St" };

/** Apply events in order, asserting each succeeds. */
function run(state: FuseState, ...events: FuseEvent[]): FuseState {
  let current = state;
  for (const event of events) {
    const result = transition(current, event);
    if (!result.ok) throw new Error(`unexpected failure: ${result.code} on ${event.type}`);
    current = result.state;
  }
  return current;
}

describe("opening a chat", () => {
  it("arms the fuse at exactly 7 days", () => {
    const state = openChat(T0);
    expect(state.status).toBe("open");
    expect(state.fuseExpiresAt).toBe(T0 + 7 * DAY);
    expect(DEFAULT_FUSE_CONFIG.windowHours).toBe(168);
  });

  it("starts with no plan and no closure", () => {
    const state = openChat(T0);
    expect(state.plan).toBeNull();
    expect(state.closure).toBeNull();
  });
});

describe("date plans", () => {
  it("requires a date, a time, and a place", () => {
    expect(isPlanComplete(PLAN)).toBe(true);
    expect(isPlanComplete({ date: "2026-08-20", time: "", place: "x" })).toBe(false);
    expect(isPlanComplete({ date: "", time: "evening", place: "x" })).toBe(false);
    expect(isPlanComplete({ date: "2026-08-20", time: "evening", place: "   " })).toBe(false);
    expect(isPlanComplete(null)).toBe(false);
  });

  it("rejects an incomplete plan", () => {
    const result = transition(openChat(T0), {
      type: "propose_plan",
      by: ALICE,
      plan: { date: "2026-08-20", time: "", place: "" },
      at: T0 + HOUR,
    });
    expect(result).toEqual({ ok: false, code: "plan_incomplete" });
  });

  it("KEEPS THE FUSE RUNNING while a proposal sits unconfirmed", () => {
    // This is the anti-gaming property. If proposing paused the clock, one member
    // could propose a plan they never intend to keep and buy unlimited time.
    const state = run(openChat(T0), {
      type: "propose_plan",
      by: ALICE,
      plan: PLAN,
      at: T0 + HOUR,
    });
    expect(state.status).toBe("open");
    expect(state.fuseExpiresAt).toBe(T0 + 7 * DAY);
  });

  it("will not let the proposer confirm their own plan", () => {
    const proposed = run(openChat(T0), {
      type: "propose_plan",
      by: ALICE,
      plan: PLAN,
      at: T0 + HOUR,
    });
    const result = transition(proposed, { type: "confirm_plan", by: ALICE, at: T0 + 2 * HOUR });
    expect(result).toEqual({ ok: false, code: "needs_other_participant" });
  });

  it("clears the fuse once BOTH have confirmed", () => {
    const state = run(
      openChat(T0),
      { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + HOUR },
      { type: "confirm_plan", by: BOB, at: T0 + 2 * HOUR },
    );
    expect(state.status).toBe("date_planned");
    expect(state.fuseExpiresAt).toBeNull();
    expect(state.plan?.confirmedBy).toBe(BOB);
  });

  it("cannot confirm a plan that was never proposed", () => {
    const result = transition(openChat(T0), { type: "confirm_plan", by: BOB, at: T0 + HOUR });
    expect(result).toEqual({ ok: false, code: "no_plan" });
  });
});

describe("cancelling a plan", () => {
  const planned = run(
    openChat(T0),
    { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + HOUR },
    { type: "confirm_plan", by: BOB, at: T0 + 2 * HOUR },
  );

  it("re-arms at +72h rather than closing the chat", () => {
    const at = T0 + 3 * DAY;
    const state = run(planned, { type: "cancel_plan", at });
    expect(state.status).toBe("open");
    expect(state.fuseExpiresAt).toBe(at + 72 * HOUR);
    expect(state.plan).toBeNull();
  });

  it("does NOT restore the original 7 days", () => {
    // A cancelled plan must not be worth more than the fuse it replaced.
    const at = T0 + 6 * DAY;
    const state = run(planned, { type: "cancel_plan", at });
    expect(state.fuseExpiresAt).toBeLessThan(at + 7 * DAY);
  });

  it("cannot cancel when no plan is confirmed", () => {
    expect(transition(openChat(T0), { type: "cancel_plan", at: T0 + HOUR })).toEqual({
      ok: false,
      code: "no_confirmed_plan",
    });
  });
});

describe("the sweep", () => {
  it("does not fire before the fuse burns down", () => {
    const state = openChat(T0);
    expect(needsSweep(state, T0 + 6 * DAY)).toBe(false);
    expect(transition(state, { type: "sweep", at: T0 + 6 * DAY })).toEqual({
      ok: false,
      code: "not_expired",
    });
  });

  it("fires exactly at expiry", () => {
    const state = openChat(T0);
    expect(needsSweep(state, T0 + 7 * DAY)).toBe(true);
  });

  it("closes with a note so nobody is left on read", () => {
    const state = run(openChat(T0), { type: "sweep", at: T0 + 7 * DAY });
    expect(state.status).toBe("closed_fuse");
    expect(state.fuseExpiresAt).toBeNull();
    expect(state.closure).not.toBeNull();
    expect(state.closure?.template).toBe(0);
    // Closed by the mechanic, not by a person — nobody has to be the bad guy.
    expect(state.closure?.closedBy).toBeNull();
  });

  it("never sweeps a chat with a confirmed plan", () => {
    const planned = run(
      openChat(T0),
      { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + HOUR },
      { type: "confirm_plan", by: BOB, at: T0 + 2 * HOUR },
    );
    expect(needsSweep(planned, T0 + 400 * DAY)).toBe(false);
  });
});

describe("closing by hand", () => {
  it("records the template and the personal line", () => {
    const state = run(openChat(T0), {
      type: "close",
      by: ALICE,
      template: 2,
      personalLine: "Take care of yourself.",
      at: T0 + DAY,
    });
    expect(state.status).toBe("closed_by_member");
    expect(state.closure?.template).toBe(2);
    expect(state.closure?.personalLine).toBe("Take care of yourself.");
    expect(state.closure?.closedBy).toBe(ALICE);
  });

  it("accepts every template the config ships", () => {
    for (let i = 0; i < CLOSURE_TEMPLATES.length; i++) {
      const result = transition(openChat(T0), {
        type: "close",
        by: ALICE,
        template: i,
        at: T0 + DAY,
      });
      expect(result.ok).toBe(true);
    }
  });

  it("rejects a template index that does not exist", () => {
    for (const template of [-1, CLOSURE_TEMPLATES.length, 1.5]) {
      expect(
        transition(openChat(T0), { type: "close", by: ALICE, template, at: T0 + DAY }),
      ).toEqual({ ok: false, code: "invalid_template" });
    }
  });

  it("caps the personal line at 140 characters", () => {
    const result = transition(openChat(T0), {
      type: "close",
      by: ALICE,
      template: 0,
      personalLine: "x".repeat(141),
      at: T0 + DAY,
    });
    expect(result).toEqual({ ok: false, code: "personal_line_too_long" });
  });

  it("can close a chat that already has a confirmed plan", () => {
    const planned = run(
      openChat(T0),
      { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + HOUR },
      { type: "confirm_plan", by: BOB, at: T0 + 2 * HOUR },
    );
    const state = run(planned, { type: "close", by: BOB, template: 3, at: T0 + 3 * DAY });
    expect(state.status).toBe("closed_by_member");
  });
});

describe("terminal states are terminal", () => {
  const closed = run(openChat(T0), { type: "close", by: ALICE, template: 0, at: T0 + DAY });
  const swept = run(openChat(T0), { type: "sweep", at: T0 + 7 * DAY });
  const graduated = run(
    openChat(T0),
    { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + HOUR },
    { type: "confirm_plan", by: BOB, at: T0 + 2 * HOUR },
    { type: "graduate", at: T0 + 8 * DAY },
  );

  const later: FuseEvent[] = [
    { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + 30 * DAY },
    { type: "confirm_plan", by: BOB, at: T0 + 30 * DAY },
    { type: "cancel_plan", at: T0 + 30 * DAY },
    { type: "close", by: ALICE, template: 0, at: T0 + 30 * DAY },
    { type: "sweep", at: T0 + 30 * DAY },
    { type: "graduate", at: T0 + 30 * DAY },
  ];

  it.each(later.map((e) => [e.type, e] as const))(
    "a closed_by_member chat rejects %s",
    (_label, event) => {
      expect(transition(closed, event)).toEqual({ ok: false, code: "already_closed" });
    },
  );

  it.each(later.map((e) => [e.type, e] as const))("a closed_fuse chat rejects %s", (_l, event) => {
    expect(transition(swept, event)).toEqual({ ok: false, code: "already_closed" });
  });

  it.each(later.map((e) => [e.type, e] as const))("a graduated chat rejects %s", (_l, event) => {
    expect(transition(graduated, event)).toEqual({ ok: false, code: "already_closed" });
  });

  it("every terminal state either carries a note or is a graduation", () => {
    // "No interaction ends in silence" (Decision #14) as an assertion.
    expect(closed.closure).not.toBeNull();
    expect(swept.closure).not.toBeNull();
    expect(graduated.status).toBe("graduated");
  });
});

describe("the countdown", () => {
  it("reports days remaining", () => {
    const state = openChat(T0);
    expect(countdown(state, T0).remainingDays).toBe(7);
    expect(countdown(state, T0 + 2 * DAY).remainingDays).toBe(5);
  });

  it("flags the final 24 hours and nothing earlier", () => {
    const state = openChat(T0);
    expect(needsExpiryWarning(state, T0 + 5 * DAY)).toBe(false);
    expect(needsExpiryWarning(state, T0 + 6 * DAY)).toBe(true);
    expect(needsExpiryWarning(state, T0 + 6 * DAY + 12 * HOUR)).toBe(true);
  });

  it("stops warning once the fuse has burned out", () => {
    const state = openChat(T0);
    expect(needsExpiryWarning(state, T0 + 7 * DAY)).toBe(false);
    expect(countdown(state, T0 + 7 * DAY).isExpired).toBe(true);
  });

  it("reports nothing running once a plan is confirmed", () => {
    const planned = run(
      openChat(T0),
      { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + HOUR },
      { type: "confirm_plan", by: BOB, at: T0 + 2 * HOUR },
    );
    const c = countdown(planned, T0 + 3 * DAY);
    expect(c.isRunning).toBe(false);
    expect(c.isExpiringSoon).toBe(false);
  });
});

describe("the fuse cannot be extended", () => {
  it("exposes no event that pushes the deadline outward", () => {
    // Decision #13 and §3.3: selling exemptions from mechanics is banned outright.
    // The guarantee is structural — no reachable transition increases
    // fuseExpiresAt above the value set when the chat opened.
    const opened = openChat(T0);
    const armedAt = opened.fuseExpiresAt as number;

    const attempts: FuseEvent[] = [
      { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + DAY },
      { type: "confirm_plan", by: BOB, at: T0 + DAY },
      { type: "close", by: ALICE, template: 0, at: T0 + DAY },
      { type: "sweep", at: T0 + 8 * DAY },
      { type: "graduate", at: T0 + DAY },
    ];

    for (const event of attempts) {
      const result = transition(opened, event);
      if (result.ok && result.state.fuseExpiresAt !== null) {
        expect(result.state.fuseExpiresAt).toBeLessThanOrEqual(armedAt);
      }
    }
  });

  it("re-arming after a cancellation is shorter than a fresh fuse", () => {
    const at = T0 + DAY;
    const planned = run(
      openChat(T0),
      { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + HOUR },
      { type: "confirm_plan", by: BOB, at: T0 + 2 * HOUR },
    );
    const reopened = run(planned, { type: "cancel_plan", at });
    const fresh = openChat(at);
    expect(reopened.fuseExpiresAt as number).toBeLessThan(fresh.fuseExpiresAt as number);
  });

  it("has no extension path in the source", () => {
    // A belt-and-braces guard: if someone adds an `extend` event later, this fails
    // and forces the conversation rather than letting it land quietly.
    const source = readFileSync(fileURLToPath(new URL("./types.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/"extend"/);
    expect(source).not.toMatch(/"pause"/);
    expect(source).not.toMatch(/"snooze"/);
  });
});

describe("purity", () => {
  it("does not mutate the state it is given", () => {
    const state = openChat(T0);
    const snapshot = structuredClone(state);
    transition(state, { type: "propose_plan", by: ALICE, plan: PLAN, at: T0 + HOUR });
    transition(state, { type: "close", by: ALICE, template: 1, at: T0 + HOUR });
    transition(state, { type: "sweep", at: T0 + 9 * DAY });
    expect(state).toEqual(snapshot);
  });

  it("is deterministic — same inputs, same output", () => {
    const a = transition(openChat(T0), { type: "sweep", at: T0 + 7 * DAY });
    const b = transition(openChat(T0), { type: "sweep", at: T0 + 7 * DAY });
    expect(a).toEqual(b);
  });
});

describe("a closed chat stays closed, and a live one keeps its deadline", () => {
  // Both of these were reachable through an "open" event that the terminal
  // guard deliberately exempted. The event had no caller; it only had a hole.
  const T0 = Date.UTC(2026, 0, 1);
  const DAY = 86_400_000;

  it("exposes no event at all that returns a chat to open", () => {
    const swept = transition(openChat(T0), { type: "sweep", at: T0 + 8 * DAY });
    expect(swept.ok).toBe(true);
    if (!swept.ok) return;
    expect(swept.state.status).toBe("closed_fuse");
    expect(swept.state.closure).not.toBeNull();

    // Every event in the union, against a closed chat.
    const events: FuseEvent[] = [
      { type: "sweep", at: T0 + 9 * DAY },
      {
        type: "propose_plan",
        at: T0 + 9 * DAY,
        by: "a",
        plan: { date: "2026-01-11", time: "19:00", place: "The park" },
      },
      { type: "confirm_plan", at: T0 + 9 * DAY, by: "b" },
      { type: "close", at: T0 + 9 * DAY, by: "a", template: 0, personalLine: null },
    ];
    for (const event of events) {
      const result = transition(swept.state, event);
      expect(result.ok, `${event.type} reopened a closed chat`).toBe(false);
      if (!result.ok) expect(result.code).toBe("already_closed");
    }
  });

  it("refuses a non-finite time rather than acting on it", () => {
    // NaN compares false against everything, so `NaN < expiresAt` read as
    // "expired" and closed a chat six days early.
    const live = openChat(T0);
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = transition(live, { type: "sweep", at });
      expect(result.ok, `sweep at ${at} was allowed`).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_time");
    }
  });

  it("agrees with needsSweep on the same input", () => {
    const live = openChat(T0);
    for (const at of [T0 + DAY, T0 + 7 * DAY, T0 + 8 * DAY, Number.NaN]) {
      const swept = transition(live, { type: "sweep", at });
      const closes = swept.ok && swept.state.status === "closed_fuse";
      expect(closes, `disagreement at ${at}`).toBe(needsSweep(live, at));
    }
  });
});
