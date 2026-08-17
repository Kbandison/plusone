import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(import.meta.dirname, "drop.ts"), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the quiz reaches the Drop", () => {
  /**
   * Onboarding asks twelve questions and stores a trait vector. drop.ts used to
   * hardcode `quizVector: null` for every candidate AND for the viewer, so
   * quizCompat returned NEUTRAL_QUIZ_COMPAT for all of them — a constant, which
   * cancels out of the ranking entirely. Thirty percent of the score under the
   * launch weights was doing nothing, and the Drop was not quiz-informed at all.
   */
  it("never hardcodes a null quiz vector", () => {
    expect(code).not.toMatch(/quizVector:\s*null/);
  });

  it("reads real vectors for the viewer and the candidates", () => {
    expect(code).toMatch(/from\("quiz_responses"\)/);
    expect(code).toMatch(/quizVector:\s*vectors\.get\(row\.id\)/);
    expect(code).toMatch(/quizVector:\s*vectors\.get\(userId\)/);
  });

  /**
   * quiz_responses is own-rows-only, and it should stay that way. Returning
   * vectors from the member-callable drop_candidates RPC would let anyone read
   * other members' trait scores by calling it directly, so the read runs with
   * the service client — server-side, where the vectors never reach a browser.
   */
  it("reads them with the service client, not the member's", () => {
    const read = code.slice(
      code.indexOf('from("quiz_responses")') - 200,
      code.indexOf('from("quiz_responses")'),
    );
    expect(read).toMatch(/serviceClient\(\)/);
  });

  it("treats an empty vector as a skipped quiz, not a vector of zeroes", () => {
    // A zero vector has magnitude 0, which quizCompat already handles — but it
    // would also count as "answered" for the confidence share.
    expect(code).toMatch(/trait_vector\?\.length \? row\.trait_vector : null/);
  });
});

describe("the Drop is recorded", () => {
  /**
   * The insert ran as the member, who holds SELECT on drops and nothing else.
   * It failed with 42501 every time and the result was discarded — so no Drop
   * was ever stored, Decision #15's free drop-connect could never apply, and
   * re-opening the app rolled a fresh Drop each time.
   */
  it("writes through record_drop rather than inserting directly", () => {
    expect(code).not.toMatch(/from\("drops"\)\s*\.insert/);
    expect(code).toMatch(/rpc\("record_drop"/);
  });

  it("does not discard the result", () => {
    expect(code).toMatch(/error: recordError/);
  });
});
