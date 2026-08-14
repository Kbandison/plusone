import type { LivenessOutcome, LivenessProvider, LivenessSession } from "./types";

/**
 * A liveness provider for development, before a real one is chosen (§4.2 defers
 * the choice to kickoff).
 *
 * Deterministic on purpose: no clock, no randomness, no network. The outcome is
 * whatever you configure, so tests and local onboarding runs are reproducible.
 *
 * It refuses to run in production. A stub that always passes IS the fake-profile
 * problem the whole verification pipeline exists to prevent, so shipping one by
 * accident has to be loud rather than quiet.
 */

export interface StubLivenessOptions {
  /** What every fetchOutcome returns. Defaults to a clean pass. */
  readonly outcome?: LivenessOutcome;
  /** Session ids handed out, in order. Defaults to stub-1, stub-2, ... */
  readonly sessionIds?: readonly string[];
  /**
   * Escape hatch for the tests that assert the production guard itself.
   * Nothing else should ever set this.
   */
  readonly allowInProduction?: boolean;
}

export const STUB_PASS: LivenessOutcome = { passed: true, score: 0.99 };
export const STUB_FAIL: LivenessOutcome = { passed: false, score: 0.1 };

export function createStubLivenessProvider(options: StubLivenessOptions = {}): LivenessProvider {
  const { outcome = STUB_PASS, sessionIds, allowInProduction = false } = options;

  if (!allowInProduction && process.env["NODE_ENV"] === "production") {
    throw new Error(
      "The stub liveness provider always returns a configured result and must never run in production. " +
        "Set LIVENESS_PROVIDER to a real adapter.",
    );
  }

  let issued = 0;

  return {
    name: "stub",

    createSession(): Promise<LivenessSession> {
      const sessionId = sessionIds?.[issued] ?? `stub-${issued + 1}`;
      issued += 1;
      return Promise.resolve({ sessionId, provider: "stub" });
    },

    fetchOutcome(): Promise<LivenessOutcome> {
      return Promise.resolve(outcome);
    },
  };
}
