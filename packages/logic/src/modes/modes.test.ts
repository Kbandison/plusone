import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODE_CONFIG,
  INTENTIONS,
  canReturnToDating,
  changeIntention,
  intentionUnlocksAt,
  isShielded,
  switchMode,
  type Intention,
  type ModeState,
} from "./index";

const AT = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const dating = (over: Partial<ModeState> = {}): ModeState => ({
  mode: "dating",
  intention: "long_term",
  intentionChangedAt: AT,
  datingReentryAt: null,
  ...over,
});

const shielded = (over: Partial<ModeState> = {}): ModeState =>
  dating({ mode: "support_only", datingReentryAt: AT + 30 * DAY, ...over });

describe("intention is locked for 30 days", () => {
  it("refuses a change inside the window", () => {
    const result = changeIntention(dating(), "casual", AT + 29 * DAY);
    expect(result).toMatchObject({ ok: false, code: "intention_locked" });
    if (!result.ok) expect(result.unlocksAt).toBe(AT + 30 * DAY);
  });

  it("allows it exactly on the boundary", () => {
    const result = changeIntention(dating(), "casual", AT + 30 * DAY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.intention).toBe("casual");
      expect(result.state.intentionChangedAt).toBe(AT + 30 * DAY);
    }
  });

  // Charging someone thirty days for touching a control and changing nothing
  // would be a trap rather than a lock.
  it("does not spend the cooldown when nothing changes", () => {
    expect(changeIntention(dating(), "long_term", AT + 40 * DAY)).toEqual({
      ok: false,
      code: "already_that_intention",
    });
  });

  it("restarts the clock from each change", () => {
    const first = changeIntention(dating(), "casual", AT + 30 * DAY);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(changeIntention(first.state, "friends_support", AT + 59 * DAY)).toMatchObject({
      ok: false,
      code: "intention_locked",
    });
  });

  it.each(INTENTIONS)("accepts %s as a destination", (intention) => {
    const from: Intention = intention === "casual" ? "long_term" : "casual";
    const result = changeIntention(dating({ intention: from }), intention, AT + 31 * DAY);
    expect(result.ok).toBe(true);
  });

  it("reports when the lock lifts", () => {
    expect(intentionUnlocksAt(dating())).toBe(AT + 30 * DAY);
  });
});

// Decision #18: support-only is a shield. A shield you have to qualify for is
// not one, and holding someone in a dating pool they have asked to leave is the
// exact harm this branch exists to prevent.
describe("leaving dating is never gated", () => {
  const moments = [AT, AT + 1, AT + 5 * DAY, AT + 365 * DAY];

  it.each(moments)("succeeds at %i, whatever the clock says", (at) => {
    const result = switchMode(dating(), "support_only", at);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.mode).toBe("support_only");
  });

  it("succeeds even with a re-entry lock already armed and unexpired", () => {
    const state = dating({ datingReentryAt: AT + 100 * DAY });
    expect(switchMode(state, "support_only", AT).ok).toBe(true);
  });

  it("has no branch that can refuse it", () => {
    const source = readFileSync(fileURLToPath(new URL("./modes.ts", import.meta.url)), "utf8");
    const branch = /if \(target === "support_only"\) \{([\s\S]*?)\n  \}/.exec(source)?.[1] ?? "";
    expect(branch).not.toContain("ok: false");
    expect(branch).not.toMatch(/\bif\b/);
  });

  it("arms the re-entry clock on the way out", () => {
    const result = switchMode(dating(), "support_only", AT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.datingReentryAt).toBe(AT + 30 * DAY);
  });
});

describe("returning to dating", () => {
  it("is refused before the clock runs out", () => {
    const result = switchMode(shielded(), "dating", AT + 29 * DAY);
    expect(result).toMatchObject({ ok: false, code: "dating_reentry_locked" });
    if (!result.ok) expect(result.unlocksAt).toBe(AT + 30 * DAY);
  });

  it("is allowed exactly on the boundary", () => {
    expect(switchMode(shielded(), "dating", AT + 30 * DAY).ok).toBe(true);
  });

  it("is instant for a member who has never left dating", () => {
    const neverLeft = shielded({ datingReentryAt: null });
    expect(switchMode(neverLeft, "dating", AT).ok).toBe(true);
  });

  // Decision #20 — a shield you can drop and raise at will is not a shield.
  it("cannot be shortened by flicking modes", () => {
    let state = dating();
    let now = AT;

    for (let cycle = 0; cycle < 5; cycle++) {
      const out = switchMode(state, "support_only", now);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      state = out.state;

      // Try to come straight back, then a day later, then two.
      for (const delta of [0, DAY, 2 * DAY]) {
        expect(switchMode(state, "dating", now + delta)).toMatchObject({
          ok: false,
          code: "dating_reentry_locked",
        });
      }

      now += 30 * DAY;
      const back = switchMode(state, "dating", now);
      expect(back.ok).toBe(true);
      if (!back.ok) return;
      state = back.state;
    }

    // Five round trips later the clock is still a full 30 days, not a
    // fraction of one.
    const out = switchMode(state, "support_only", now);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.state.datingReentryAt).toBe(now + 30 * DAY);
  });

  it("agrees with canReturnToDating", () => {
    expect(canReturnToDating(shielded(), AT + 29 * DAY)).toBe(false);
    expect(canReturnToDating(shielded(), AT + 30 * DAY)).toBe(true);
    expect(canReturnToDating(dating(), AT + 99 * DAY)).toBe(false);
  });
});

describe("switching to the mode you are already in", () => {
  it.each(["dating", "support_only"] as const)("is refused for %s", (mode) => {
    const state = mode === "dating" ? dating() : shielded();
    expect(switchMode(state, mode, AT + 99 * DAY)).toEqual({
      ok: false,
      code: "already_that_mode",
    });
  });

  // Otherwise "switch to support_only" while already there would re-arm the
  // clock, quietly extending a lock the member never triggered.
  it("does not re-arm the re-entry clock", () => {
    const state = shielded();
    expect(switchMode(state, "support_only", AT + 29 * DAY).ok).toBe(false);
    expect(state.datingReentryAt).toBe(AT + 30 * DAY);
  });
});

describe("purity", () => {
  it("never mutates the state it is given", () => {
    const state = dating();
    const snapshot = structuredClone(state);
    switchMode(state, "support_only", AT);
    changeIntention(state, "casual", AT + 40 * DAY);
    expect(state).toEqual(snapshot);
  });

  it("reads no clock", () => {
    const result = switchMode(dating(), "support_only", 42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.datingReentryAt).toBe(42 + 30 * DAY);
  });

  it("shields exactly the support-only members", () => {
    expect(isShielded(shielded())).toBe(true);
    expect(isShielded(dating())).toBe(false);
  });

  it("uses the locked config defaults", () => {
    expect(DEFAULT_MODE_CONFIG).toEqual({ intentionChangeDays: 30, datingReentryDays: 30 });
  });
});
