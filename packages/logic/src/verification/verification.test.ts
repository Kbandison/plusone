import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_VERIFICATION_CONFIG,
  INITIAL_STATE,
  attemptsRemaining,
  createStubLivenessProvider,
  isAcceptable,
  isVerified,
  needsHumanReview,
  transition,
  STUB_FAIL,
  STUB_PASS,
  type VerificationEvent,
  type VerificationState,
  type VerificationStatus,
} from "./index";

const AT = 1_700_000_000_000;

/** Applies events in order, asserting each one succeeds. */
function drive(state: VerificationState, ...events: VerificationEvent[]): VerificationState {
  let current = state;
  for (const event of events) {
    const result = transition(current, event);
    if (!result.ok) throw new Error(`unexpected failure on ${event.type}: ${result.code}`);
    current = result.state;
  }
  return current;
}

const phone: VerificationEvent = { type: "verify_phone", at: AT };
const start: VerificationEvent = { type: "start_liveness", at: AT };
const pass: VerificationEvent = { type: "liveness_result", at: AT, outcome: STUB_PASS };
const flunk: VerificationEvent = { type: "liveness_result", at: AT, outcome: STUB_FAIL };

/** Drives a member to `flagged` the only way the machine allows. */
function toFlagged(): VerificationState {
  let state = drive(INITIAL_STATE, phone);
  for (let i = 0; i < DEFAULT_VERIFICATION_CONFIG.maxLivenessAttempts; i++) {
    state = drive(state, start, flunk);
  }
  expect(state.status).toBe("flagged");
  return state;
}

describe("the clean path", () => {
  it("reaches verified with no human involved", () => {
    const state = drive(INITIAL_STATE, phone, start, pass);
    expect(state.status).toBe("verified");
    expect(isVerified(state)).toBe(true);
    expect(needsHumanReview(state)).toBe(false);
    expect(state.livenessAttempts).toBe(1);
    expect(state.decidedAt).toBe(AT);
  });

  it("keeps only a boolean-equivalent status and a score — never the selfie", () => {
    const state = drive(INITIAL_STATE, phone, start, pass);
    expect(state.lastScore).toBe(STUB_PASS.score);
    expect(Object.keys(state).sort()).toEqual([
      "appealDecidedAt",
      "appealOpenedAt",
      "decidedAt",
      "lastScore",
      "livenessAttempts",
      "status",
    ]);
  });

  it("refuses liveness before the phone is verified", () => {
    expect(transition(INITIAL_STATE, start)).toEqual({ ok: false, code: "phone_not_verified" });
  });

  it("refuses a second check while one is in flight", () => {
    const state = drive(INITIAL_STATE, phone, start);
    expect(transition(state, start)).toEqual({ ok: false, code: "liveness_already_in_progress" });
  });

  it("refuses a result when no check is in flight", () => {
    const state = drive(INITIAL_STATE, phone);
    expect(transition(state, pass)).toEqual({ ok: false, code: "no_liveness_in_progress" });
  });
});

describe("the independent score floor", () => {
  it("rejects a provider pass that falls below our own floor", () => {
    const outcome = { passed: true, score: DEFAULT_VERIFICATION_CONFIG.minScore - 0.01 };
    expect(isAcceptable(outcome, DEFAULT_VERIFICATION_CONFIG)).toBe(false);

    const state = drive(INITIAL_STATE, phone, start);
    const result = transition(state, { type: "liveness_result", at: AT, outcome });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.status).toBe("phone_verified");
  });

  it("accepts exactly at the floor", () => {
    const outcome = { passed: true, score: DEFAULT_VERIFICATION_CONFIG.minScore };
    expect(isAcceptable(outcome, DEFAULT_VERIFICATION_CONFIG)).toBe(true);
  });

  it("never accepts a high score the provider itself failed", () => {
    expect(isAcceptable({ passed: false, score: 1 }, DEFAULT_VERIFICATION_CONFIG)).toBe(false);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an out-of-range score (%s)",
    (score) => {
      const state = drive(INITIAL_STATE, phone, start);
      expect(
        transition(state, { type: "liveness_result", at: AT, outcome: { passed: true, score } }),
      ).toEqual({ ok: false, code: "score_out_of_range" });
    },
  );
});

describe("retries", () => {
  it("returns the member to phone_verified while attempts remain", () => {
    const state = drive(INITIAL_STATE, phone, start, flunk);
    expect(state.status).toBe("phone_verified");
    expect(state.livenessAttempts).toBe(1);
    expect(attemptsRemaining(state)).toBe(DEFAULT_VERIFICATION_CONFIG.maxLivenessAttempts - 1);
  });

  it("still lets a later attempt succeed", () => {
    const failed = drive(INITIAL_STATE, phone, start, flunk);
    expect(drive(failed, start, pass).status).toBe("verified");
  });

  // Decision #21 — manual review ONLY on risk flags. Exhausted retries are a
  // risk flag; they are not a verdict.
  it("sends an exhausted member to a human, not to a wall", () => {
    const state = toFlagged();
    expect(state.status).toBe("flagged");
    expect(needsHumanReview(state)).toBe(true);
    expect(attemptsRemaining(state)).toBe(0);
  });

  it("never reports negative attempts remaining", () => {
    const state = { ...toFlagged(), livenessAttempts: 99 };
    expect(attemptsRemaining(state)).toBe(0);
  });

  it("will not start a fresh check once flagged, and says why correctly", () => {
    // The code used to be "not_under_review" — the exact inverse of the
    // member's situation, told to them by any screen that reads it.
    expect(transition(toFlagged(), start)).toEqual({ ok: false, code: "under_review" });
  });

  it("keeps not_under_review for the case that really is not under review", () => {
    const fresh = drive(INITIAL_STATE, { type: "verify_phone", at: AT });
    expect(transition(fresh, { type: "open_appeal", at: AT })).toEqual({
      ok: false,
      code: "not_under_review",
    });
  });

  // Otherwise: fail three times, re-run the OTP, and walk straight back to a
  // fresh set of attempts. The flag queue would be decorative.
  it("does not let re-running the OTP walk a member out of review", () => {
    const state = drive(toFlagged(), phone);
    expect(state.status).toBe("flagged");
  });

  it("does not let re-running the OTP cancel a check in flight", () => {
    const state = drive(INITIAL_STATE, phone, start);
    expect(drive(state, phone).status).toBe("liveness_pending");
  });
});

describe("the appeal is never gated on the thing being appealed", () => {
  it.each(["flagged", "rejected"] as const)("opens from %s", (status) => {
    const state: VerificationState = { ...toFlagged(), status };
    const result = transition(state, { type: "open_appeal", at: AT });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.appealOpenedAt).toBe(AT);
  });

  // The point of Decision #21: a member who has NEVER passed a check, and whose
  // every attempt scored zero, must still be able to ask a human to look.
  it("opens for a member who never passed a single check", () => {
    const state: VerificationState = {
      status: "flagged",
      livenessAttempts: 99,
      lastScore: 0,
      decidedAt: AT,
      appealOpenedAt: null,
      appealDecidedAt: null,
    };
    expect(transition(state, { type: "open_appeal", at: AT }).ok).toBe(true);
  });

  it("does not open for a member who is not under review", () => {
    const verified = drive(INITIAL_STATE, phone, start, pass);
    expect(transition(verified, { type: "open_appeal", at: AT })).toEqual({
      ok: false,
      code: "not_under_review",
    });
  });

  it("does not open twice", () => {
    const appealed = drive(toFlagged(), { type: "open_appeal", at: AT });
    expect(transition(appealed, { type: "open_appeal", at: AT })).toEqual({
      ok: false,
      code: "appeal_already_open",
    });
  });

  it("leaves the appeal on the record after an admin decides", () => {
    const appealed = drive(toFlagged(), { type: "open_appeal", at: AT });
    const decided = drive(appealed, { type: "admin_decide", at: AT + 1, approve: true });
    expect(decided.appealOpenedAt).toBe(AT);
  });
});

describe("administrators", () => {
  it("can verify a flagged member", () => {
    const state = drive(toFlagged(), { type: "admin_decide", at: AT + 1, approve: true });
    expect(state.status).toBe("verified");
    expect(state.decidedAt).toBe(AT + 1);
  });

  it("can reject a flagged member", () => {
    expect(drive(toFlagged(), { type: "admin_decide", at: AT, approve: false }).status).toBe(
      "rejected",
    );
  });

  it("can still verify after a rejection, so an appeal can succeed", () => {
    const rejected = drive(toFlagged(), { type: "admin_decide", at: AT, approve: false });
    expect(drive(rejected, { type: "admin_decide", at: AT + 1, approve: true }).status).toBe(
      "verified",
    );
  });

  it("cannot decide on a member who is not under review", () => {
    expect(transition(INITIAL_STATE, { type: "admin_decide", at: AT, approve: false })).toEqual({
      ok: false,
      code: "not_under_review",
    });
  });
});

// `rejected` is a judgement about a person. Nothing automatic should be able to
// reach it — an automated dead end with no way out is the hostile verification
// Decision #21 exists in reaction to.
describe("no automatic rejection", () => {
  it("never reaches rejected without an administrator, however many checks fail", () => {
    let state = drive(INITIAL_STATE, phone);
    const seen = new Set<VerificationStatus>([state.status]);

    for (let i = 0; i < 50; i++) {
      for (const event of [start, flunk, phone, pass] satisfies VerificationEvent[]) {
        const result = transition(state, event);
        if (result.ok) {
          state = result.state;
          seen.add(state.status);
        }
      }
    }

    expect(seen.has("rejected")).toBe(false);
    expect(seen.has("flagged")).toBe(true);
  });
});

describe("purity", () => {
  it("does not mutate the state it is given", () => {
    const before = drive(INITIAL_STATE, phone);
    const snapshot = structuredClone(before);
    transition(before, start);
    expect(before).toEqual(snapshot);
  });

  it("is deterministic — the same input gives the same output every time", () => {
    const state = drive(INITIAL_STATE, phone, start);
    const a = transition(state, pass);
    const b = transition(state, pass);
    expect(a).toEqual(b);
  });

  it("reads no clock — every timestamp comes from the event", () => {
    const state = drive(INITIAL_STATE, phone, start, {
      type: "liveness_result",
      at: 42,
      outcome: STUB_PASS,
    });
    expect(state.decidedAt).toBe(42);
  });
});

describe("the stub provider", () => {
  it("returns the configured outcome", async () => {
    const provider = createStubLivenessProvider({ outcome: STUB_FAIL });
    const session = await provider.createSession();
    expect(await provider.fetchOutcome(session.sessionId)).toEqual(STUB_FAIL);
  });

  it("passes by default", async () => {
    const provider = createStubLivenessProvider();
    expect(await provider.fetchOutcome("anything")).toEqual(STUB_PASS);
  });

  it("issues deterministic session ids", async () => {
    const provider = createStubLivenessProvider();
    expect((await provider.createSession()).sessionId).toBe("stub-1");
    expect((await provider.createSession()).sessionId).toBe("stub-2");
  });

  // A stub that always passes IS the fake-profile problem the pipeline exists
  // to prevent. Shipping one by accident has to be loud.
  it("refuses to run in production", () => {
    const previous = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      expect(() => createStubLivenessProvider()).toThrow(/never run in production/);
    } finally {
      process.env["NODE_ENV"] = previous;
    }
  });
});

// The purge in §4.2 cannot be forgotten if there is nowhere to keep the thing.
describe("structural guarantees", () => {
  const source = readFileSync(fileURLToPath(new URL("./types.ts", import.meta.url)), "utf8");

  /** Declared property names of an interface, ignoring types and comments. */
  function fieldsOf(interfaceName: string): string[] {
    const block = new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`).exec(
      source,
    )?.[1];
    expect(block, `${interfaceName} not found in types.ts`).toBeDefined();
    return [...(block ?? "").matchAll(/^\s*readonly (\w+)/gm)].map((m) => m[1] as string).sort();
  }

  it("has no field anywhere in the state that could hold raw media", () => {
    expect(fieldsOf("VerificationState")).toEqual([
      "appealDecidedAt",
      "appealOpenedAt",
      "decidedAt",
      "lastScore",
      "livenessAttempts",
      "status",
    ]);
  });

  // Providers offer far more than this — Stripe Identity returns name, address
  // and date of birth. The seam is the narrow point where that stops.
  it("gives the provider seam nowhere to return a document, name or birthdate", () => {
    expect(fieldsOf("LivenessOutcome")).toEqual(["passed", "score"]);
  });

  it("mirrors the SQL verification_status enum exactly", () => {
    const statuses: VerificationStatus[] = [
      "unverified",
      "phone_verified",
      "liveness_pending",
      "verified",
      "flagged",
      "rejected",
    ];
    const block = /export type VerificationStatus =([\s\S]*?);/.exec(source)?.[1] ?? "";
    for (const status of statuses) expect(block).toContain(`"${status}"`);
    expect(block.match(/"/g)?.length).toBe(statuses.length * 2);
  });
});

describe("no dead ends", () => {
  it("lets a rejected member appeal the rejection", () => {
    // Decision #21: "Appeal path never locked behind the thing being appealed."
    // The guard used to ask whether an appeal had ever been opened, so the
    // first one consumed a member's only appeal — including when the thing they
    // wanted to appeal was the ruling on it.
    const appealed = drive(toFlagged(), { type: "open_appeal", at: AT });
    const rejected = drive(appealed, { type: "admin_decide", at: AT + 1, approve: false });
    expect(rejected.status).toBe("rejected");
    expect(rejected.appealOpenedAt).toBe(AT); // still on the record

    const again = transition(rejected, { type: "open_appeal", at: AT + 2 });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.state.appealOpenedAt).toBe(AT + 2);
  });

  it("still refuses a second appeal while the first is undecided", () => {
    const appealed = drive(toFlagged(), { type: "open_appeal", at: AT });
    expect(transition(appealed, { type: "open_appeal", at: AT + 1 })).toEqual({
      ok: false,
      code: "appeal_already_open",
    });
  });

  it("lets an administrator rescue a member whose liveness session never returned", () => {
    // A provider outage left the member in liveness_pending, where every event
    // refused — start_liveness said already_in_progress, verify_phone was a
    // no-op, and admin_decide said not_under_review. Nobody could reach them.
    const pending = drive(drive(INITIAL_STATE, { type: "verify_phone", at: AT }), {
      type: "start_liveness",
      at: AT,
    });
    expect(pending.status).toBe("liveness_pending");

    const rescued = transition(pending, { type: "admin_decide", at: AT + 1, approve: true });
    expect(rescued.ok).toBe(true);
    if (rescued.ok) expect(rescued.state.status).toBe("verified");
  });

  it("gives every non-verified status some event that moves it", () => {
    const states: VerificationState[] = [
      INITIAL_STATE,
      drive(INITIAL_STATE, { type: "verify_phone", at: AT }),
      drive(drive(INITIAL_STATE, { type: "verify_phone", at: AT }), {
        type: "start_liveness",
        at: AT,
      }),
      toFlagged(),
      drive(toFlagged(), { type: "admin_decide", at: AT + 1, approve: false }),
    ];
    for (const state of states) {
      const events: VerificationEvent[] = [
        { type: "verify_phone", at: AT + 5 },
        { type: "start_liveness", at: AT + 5 },
        { type: "open_appeal", at: AT + 5 },
        { type: "admin_decide", at: AT + 5, approve: true },
      ];
      const moves = events.some((event) => {
        const result = transition(state, event);
        return result.ok && result.state !== state && result.state.status !== state.status;
      });
      expect(moves, `${state.status} is a dead end`).toBe(true);
    }
  });
});
