import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./drop.ts", import.meta.url)), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * The `drops` row is what makes a Drop stick: the read at the top of
 * getTonightsDrop returns it verbatim for the rest of the member's local day.
 *
 * Writing one with no ids froze "nobody nearby" in place. A member who opened
 * the app before anybody within their radius had been verified got an empty
 * Drop and then kept getting it until midnight, while people they could have
 * met sat one query away — and nothing on screen distinguished that from a
 * genuinely thin night.
 */
describe("an empty Drop is not written down", () => {
  it("only records when something was chosen", () => {
    expect(code).toMatch(/if \(servedIds\.length > 0\) \{[\s\S]{0,400}?record_drop/);
  });

  it("still shows the empty result rather than failing", () => {
    const after = code.slice(code.indexOf("if (servedIds.length > 0)"));
    expect(after).toMatch(/return result\.preview/);
  });

  /**
   * A Drop that cannot be RECORDED is still shown — the member should not lose
   * their evening to bookkeeping — but the failure is reported, not swallowed.
   */
  it("reports a failed write instead of swallowing it", () => {
    expect(code).toMatch(/at: "drop\.record"/);
  });

  /** The read that the row feeds, which is why an empty one is sticky. */
  it("returns a stored Drop verbatim for the rest of the day", () => {
    expect(code).toMatch(/if \(existing\) \{/);
    expect(code).toMatch(/\.eq\("drop_date", dropDate\)/);
  });
});
