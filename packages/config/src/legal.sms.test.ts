import { describe, expect, it } from "vitest";

import { PRIVACY_POLICY } from "./legal";

/**
 * The three things A2P 10DLC campaign registration requires of the privacy
 * policy a campaign links to.
 *
 * Carriers state them explicitly on the registration form: a non-sharing
 * statement for mobile numbers, the message frequency, and a "message and data
 * rates may apply" disclosure. The policy had none of the three — the app said
 * the rates line on the phone screen, and the document the campaign points at
 * said nothing at all.
 *
 * A rejected campaign means no SMS, and no SMS means nobody can sign in, so
 * this is load-bearing rather than paperwork.
 */

const text = PRIVACY_POLICY.flatMap((section) => [
  section.title,
  ...section.body,
  ...(section.list ?? []),
]).join("\n");

describe("the privacy policy, as A2P registration requires it", () => {
  it("has a section about text messages at all", () => {
    expect(PRIVACY_POLICY.map((s) => s.id)).toContain("text-messages");
  });

  it("says mobile numbers are not sold or shared", () => {
    expect(text).toMatch(/never sell your mobile number/i);
    expect(text).toMatch(/never share it with anyone for their own marketing/i);
  });

  it("states how often messages are sent", () => {
    expect(text).toMatch(/how often/i);
    expect(text).toMatch(/only when you ask/i);
  });

  it("carries the rates disclosure verbatim", () => {
    // Carriers look for this phrasing. Paraphrasing it is a rejection.
    expect(text).toMatch(/Message and data rates may apply\./);
  });

  it("explains STOP, and what STOP costs when a text is the only way in", () => {
    expect(text).toMatch(/reply STOP/i);
    expect(text).toMatch(/reply START/i);
    // The cost is now conditional — a member who added an email keeps a way in,
    // and one who did not does not. Both halves have to be stated, because
    // stating only the mild one understates what STOP does to most members and
    // stating only the severe one is no longer true.
    expect(text).toMatch(/still sign in with a code sent there/i);
    expect(text).toMatch(/unable to sign in/i);
  });

  /**
   * Added when email sign-in shipped. The policy claimed a text was "the only
   * way into this app" — true when it was written, false the day Settings could
   * take an email, and it is a document a carrier reviewer reads.
   */
  it("no longer claims a text is the only way in", () => {
    expect(text).not.toMatch(/the only way into this app/i);
  });
});
