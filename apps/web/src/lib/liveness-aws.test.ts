import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isTerminalStatus, normalizeConfidence, passedFromStatus } from "./liveness-aws";

/**
 * The two pure functions that translate AWS's vocabulary into the seam's.
 * Everything else in liveness-aws.ts is network, and was verified against the
 * live API — including that federated browser credentials are refused for both
 * GetFaceLivenessSessionResults and CreateFaceLivenessSession.
 */
describe("normalizeConfidence — AWS reports 0–100, the seam wants 0–1", () => {
  it.each([
    [100, 1],
    [80, 0.8],
    [0, 0],
    [99.5, 0.995],
  ])("maps %s to %s", (aws, expected) => {
    expect(normalizeConfidence(aws)).toBeCloseTo(expected, 5);
  });

  /**
   * A session that has been created but not streamed returns no Confidence at
   * all — confirmed against the live API, which answered `Status: CREATED,
   * Confidence: undefined`. Without this it would be NaN, and `NaN >= minScore`
   * is false, so it would happen to behave — until someone compared it the
   * other way round.
   */
  it("treats a missing confidence as zero, not NaN", () => {
    expect(normalizeConfidence(undefined)).toBe(0);
    expect(normalizeConfidence(Number.NaN)).toBe(0);
  });

  it("clamps, so a provider bug cannot manufacture a pass", () => {
    expect(normalizeConfidence(120)).toBe(1);
    expect(normalizeConfidence(-5)).toBe(0);
  });
});

describe("passedFromStatus", () => {
  it("passes only on SUCCEEDED", () => {
    expect(passedFromStatus("SUCCEEDED")).toBe(true);
  });

  /**
   * CREATED and IN_PROGRESS matter most: they are what an unfinished session
   * returns, and treating either as a pass would verify anyone who created a
   * session and never showed their face.
   */
  it.each(["CREATED", "IN_PROGRESS", "FAILED", "EXPIRED", undefined, ""])(
    "does not pass on %s",
    (status) => {
      expect(passedFromStatus(status)).toBe(false);
    },
  );
});

describe("isTerminalStatus — a verdict, not a progress report", () => {
  /**
   * The bug Kevin spent an evening on. The adapter read the result once, the
   * instant the browser stopped streaming, and mapped everything that was not
   * SUCCEEDED to a failed check. But the analysis runs AFTER the stream ends,
   * so IN_PROGRESS is the normal first answer — and a member who passed was
   * recorded as having failed, three times, and handed to a human for it.
   *
   * AWS documents polling until the status is terminal. These two are the ones
   * that must never be mistaken for a verdict.
   */
  it.each(["CREATED", "IN_PROGRESS"])("%s is not a verdict", (status) => {
    expect(isTerminalStatus(status)).toBe(false);
  });

  it.each(["SUCCEEDED", "FAILED", "EXPIRED"])("%s is", (status) => {
    expect(isTerminalStatus(status)).toBe(true);
  });

  it("treats an absent status as not settled", () => {
    // Better to poll again and eventually throw than to call it a failure.
    expect(isTerminalStatus(undefined)).toBe(false);
    expect(isTerminalStatus("")).toBe(false);
  });

  /**
   * Every status this app can see is either terminal or polled. A new one
   * appearing in the SDK and silently landing in the non-terminal bucket would
   * mean a member waiting seven seconds and getting a retryable error, which is
   * the safe direction — but it should be a decision, not a default.
   */
  it("covers the documented status set exactly", () => {
    const documented = ["CREATED", "IN_PROGRESS", "SUCCEEDED", "FAILED", "EXPIRED"];
    const terminal = documented.filter(isTerminalStatus);
    expect(terminal).toEqual(["SUCCEEDED", "FAILED", "EXPIRED"]);
  });
});

describe("polling never turns impatience into a failed check", () => {
  const source = readFileSync(fileURLToPath(new URL("./liveness-aws.ts", import.meta.url)), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("throws when the verdict never arrives, rather than returning passed:false", () => {
    const fetchOutcome = code.slice(code.indexOf("async fetchOutcome"));
    expect(fetchOutcome).toMatch(/throw new Error/);
    // A `passed: false` fallback after the loop would spend an attempt on our
    // own timeout and, three times over, flag the member for it.
    const afterLoop = fetchOutcome.slice(fetchOutcome.lastIndexOf("await wait("));
    expect(afterLoop).not.toMatch(/passed:\s*false/);
  });

  it("only returns an outcome once the status is terminal", () => {
    expect(code).toMatch(/if \(isTerminalStatus\(response\.Status\)\)/);
  });
});

/**
 * The one diagnostic that can answer "good camera, good light, still fails".
 *
 * FAILED and SUCCEEDED-under-our-floor are the same screen to a member and
 * opposite problems to fix: the first went wrong at AWS, the second is our own
 * threshold refusing a verdict AWS was happy with. Nothing else distinguishes
 * them, and the log was gated to non-production — present in the one place
 * nobody is failing checks, absent in the only place anybody is.
 */
describe("the AWS verdict is observable where members actually are", () => {
  const source = readFileSync(fileURLToPath(new URL("./liveness-aws.ts", import.meta.url)), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const logged = code.slice(code.indexOf('at: "liveness.aws"'), code.indexOf("polls:") + 40);

  it("is not gated on the environment", () => {
    expect(code).not.toMatch(/NODE_ENV/);
  });

  it("records the two numbers that tell the cases apart", () => {
    expect(logged).toMatch(/status:\s*response\.Status/);
    expect(logged).toMatch(/confidence:\s*response\.Confidence/);
  });

  /**
   * §4.2: purge raw media post-decision, keep boolean + score only. A log line
   * that carried the member, the session id or any part of ReferenceImage would
   * put a face and an identity into a log aggregator forever — and this app
   * refuses to write a condition into any payload at all.
   */
  it("says nothing about who it was", () => {
    for (const forbidden of [
      "userId",
      "user_id",
      "sessionId",
      "SessionId",
      "ReferenceImage",
      "AuditImages",
      "Bytes",
    ]) {
      expect(logged).not.toContain(forbidden);
    }
  });
});
