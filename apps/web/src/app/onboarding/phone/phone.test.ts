import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The way back in has to be visible BEFORE the refusal.
 *
 * The link existed only inside the closed-beta card, which is shown after the
 * gate has already turned somebody away. That is one confusing round trip for a
 * returning member in a browser, and a dead end in the iOS shell: `server.url`
 * is `/app` since 137d358, a signed-out launch lands here, and a shell has no
 * address bar — so there was no route to `/sign-in` that did not begin with
 * being rejected. An App Review reviewer meeting that files a 2.1.
 *
 * Pinned by POSITION, not by presence: the file always contained a `/sign-in`
 * href, so "does it link to sign-in" passed the whole time it was unreachable.
 */
describe("a member who already has an account is never stranded", () => {
  const form = readFileSync(fileURLToPath(new URL("./phone-form.tsx", import.meta.url)), "utf8");

  it("offers sign-in on the normal form, not only after a refusal", () => {
    // NOT by file position. The refusal card is written EARLIER in the file
    // than the form a member sees first, so "the link comes before the closed
    // branch" is false while being exactly the property wanted — my first
    // version of this asserted that and failed on a correct fix.
    //
    // The form the member meets on arrival is the component's main return, so
    // the question is whether a sign-in link appears inside it.
    const mainForm = form.slice(form.indexOf("<form"));
    expect(mainForm).toContain('href="/sign-in"');
  });

  it("still offers it on the refusal card too", () => {
    expect(form.split('href="/sign-in"').length - 1).toBeGreaterThanOrEqual(2);
  });
});
