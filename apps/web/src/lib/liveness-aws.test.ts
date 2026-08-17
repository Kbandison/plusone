import { describe, expect, it } from "vitest";

import { normalizeConfidence, passedFromStatus } from "./liveness-aws";

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
