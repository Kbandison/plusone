import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  BRAND,
  BANNED_PRIVACY_CLAIMS,
  CONSENT_COPY_DIGEST,
  CONSENT_COPY_VERSION,
  COPY,
  HEALTH_DATA_ANCHOR,
  PRIVACY_POLICY,
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_INTRO,
  CLOSURE_TEMPLATES,
  renderClosureTemplate,
} from "./index";

/**
 * Everything the member is agreeing to: the §9.1 body and the checkbox label
 * they tick. The heading and the button are chrome and are deliberately not
 * part of what a consent is bound to.
 */
const CONSENTED_TEXT = {
  health_data: `${COPY.consent.healthData}\n${COPY.consent.checkboxLabel}`,
} as const;

describe("consent copy versioning", () => {
  // §9.1 stores copy_version with every consent so a member's tick is tied to
  // the words they actually read. If the words change and the version does not,
  // old consents would silently stand in for new wording — which is the failure
  // this test exists to make impossible to ship.
  it.each(Object.keys(CONSENT_COPY_VERSION) as (keyof typeof CONSENT_COPY_VERSION)[])(
    "fails when %s copy changes without a version bump",
    (kind) => {
      const digest = createHash("sha256").update(CONSENTED_TEXT[kind]).digest("hex").slice(0, 16);
      expect(
        digest,
        `The ${kind} consent text changed (body or checkbox label). Bump ` +
          `CONSENT_COPY_VERSION.${kind} and set CONSENT_COPY_DIGEST.${kind} to "${digest}", ` +
          `so members re-consent to the new wording.`,
      ).toBe(CONSENT_COPY_DIGEST[kind]);
    },
  );

  it("has a version for every digest and a digest for every version", () => {
    expect(Object.keys(CONSENT_COPY_VERSION).sort()).toEqual(
      Object.keys(CONSENT_COPY_DIGEST).sort(),
    );
  });

  it("uses a version string the consents table can store", () => {
    for (const version of Object.values(CONSENT_COPY_VERSION)) {
      expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("the §9.1 copy itself", () => {
  const text = COPY.consent.healthData;

  it("names exactly what is stored", () => {
    expect(text).toContain("your community, condition type, and optional U=U badge");
  });

  it("names what is never collected", () => {
    expect(text).toContain("never collect medical records, test results, or diagnosis details");
  });

  it("promises no sale or sharing of health information", () => {
    expect(text).toContain("never sell or share your health information");
  });

  it("promises permanent deletion", () => {
    expect(text).toContain("delete everything, permanently, at any time");
  });

  // Marketing says "private", never "encrypted" — E2EE is out for v1 and the
  // claim would not be true.
  it("makes no claim the product cannot keep", () => {
    expect(text).not.toMatch(/encrypted|anonymous|guaranteed/i);
  });
});

describe("the privacy policy draft", () => {
  const all = [
    PRIVACY_POLICY_INTRO,
    ...PRIVACY_POLICY.flatMap((s) => [...s.body, ...(s.list ?? [])]),
  ];

  // §9.1's consent screen links to /privacy#health-data. If the section is
  // renamed, the link silently goes nowhere — so the anchor is asserted.
  it("has the health-data section the consent screen links to", () => {
    expect(PRIVACY_POLICY.map((s) => s.id)).toContain(HEALTH_DATA_ANCHOR);
  });

  // §3.3: never "encrypted", "anonymous" or "guaranteed" — UNLESS LITERALLY
  // TRUE. So the rule is not avoidance, it is qualification. "Encrypted in
  // transit" is a fact and belongs in a privacy policy; a bare "encrypted"
  // would imply E2EE, which Decision #29 puts out of v1.
  const LITERALLY_TRUE = [/in transit/i, /at rest/i];

  it("uses a banned claim only when denied or literally qualified", () => {
    for (const text of all) {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        for (const claim of BANNED_PRIVACY_CLAIMS) {
          if (!new RegExp(`\\b${claim}`, "i").test(sentence)) continue;
          const denied = /\b(not|never|no)\b/i.test(sentence);
          const qualified = LITERALLY_TRUE.some((q) => q.test(sentence));
          expect(
            denied || qualified,
            `"${sentence}" claims "${claim}" without denying or qualifying it`,
          ).toBe(true);
        }
      }
    }
  });

  // Decision #29 lists BOTH: encryption in transit and at rest is real
  // protection, and E2EE being out is a real limitation. Stating only the
  // limitation understates the product; stating only the protection oversells
  // it. The policy has to carry both.
  it("states both that messages are encrypted and that they are not E2EE", () => {
    const messages = PRIVACY_POLICY.find((s) => s.id === "messages")?.body.join(" ") ?? "";
    expect(messages).toContain("encrypted in transit");
    expect(messages).toContain("at rest");
    expect(messages).toContain("not end-to-end encrypted");
  });

  it("gives the reason E2EE is out rather than just asserting it", () => {
    const messages = PRIVACY_POLICY.find((s) => s.id === "messages")?.body.join(" ") ?? "";
    expect(messages).toMatch(/moderation/i);
  });

  it("promises no sale of health data", () => {
    const health = PRIVACY_POLICY.find((s) => s.id === HEALTH_DATA_ANCHOR);
    expect(health?.body.join(" ")).toContain("do not sell it");
  });

  it("gives every section a unique id and a title", () => {
    const ids = PRIVACY_POLICY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of PRIVACY_POLICY) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  // §9.4's JSON export is unbuilt and is second in the §10 cut order. A policy
  // is the one document that cannot describe intentions, so the promise stays
  // out until the feature is in. Delete this test when the export ships.
  it("promises no data export while the export does not exist", () => {
    for (const text of all) {
      expect(text, `"${text.slice(0, 70)}…"`).not.toMatch(/\bexport\b/i);
    }
  });

  /**
   * This asserted the opposite until 2026-08-25, and said why: the policy
   * commits to rights that carry response clocks, so it needs a route for
   * making a request — and there was none, because the domain was not secured.
   * "Delete this test and add the address when it is."
   *
   * loveplusone.app was secured on 2026-08-17, so the address is in and this is
   * the inverse. What it does NOT prove is that anybody reads the inbox; that
   * stays a by-hand line in verify-launch, where it belongs.
   */
  it("gives a route for the requests it invites", () => {
    const contact = PRIVACY_POLICY.find((section) => section.id === "contact");
    expect(contact).toBeDefined();
    expect(contact?.body.join(" ")).toMatch(/@[\w.-]+\.[a-z]{2,}/i);
  });

  it("names the operating entity, so a reader knows who holds the data", () => {
    const joined = all.join(" ");
    expect(joined).toContain(BRAND.legalName);
    // Built from BRAND rather than written out, so the entity and the address
    // cannot drift from what the rest of the app uses.
    expect(joined).toContain(BRAND.supportEmail);
  });

  /**
   * Two sections of this policy disagreed, and shipping the email notifier made
   * it matter.
   *
   * "What we store" said the address "is used to send you a code and nothing
   * else" while "Notifications" said "Emails all carry the same subject line" —
   * a contradiction that was harmless only while nothing sent any. A policy is
   * a promise about what the product does with data, so the moment notify()
   * grew an email cohort the first line became false.
   *
   * Pinned by what the app can do rather than by the string, so this fails
   * again if the address ever acquires another use that goes unmentioned.
   */
  it("describes every use the address is actually put to", () => {
    const stored = PRIVACY_POLICY.find((section) => section.id === "what-we-store");
    const address = (stored?.list ?? []).find((item) => /email address/i.test(item));
    expect(address).toBeDefined();

    // Sign-in, which is why somebody adds one.
    expect(address).toMatch(/sign|code/i);
    // And notifications, because emailNotifier exists and notify() plans an
    // email cohort. "nothing else" is the phrasing this replaced.
    expect(address).toMatch(/notification/i);
    expect(address).not.toMatch(/nothing else/i);
  });

  /**
   * The policy claimed to keep a confidence score. Nothing does.
   *
   * liveness-aws.ts computes one and the reducer thresholds on it, and then the
   * verdict is written as verification_status, liveness_attempts and two
   * timestamps — the action says so itself: "it does not report its score".
   * So the app retained LESS than the policy described, which is the harmless
   * direction to be wrong in and still wrong: this file's own header says every
   * claim is checkable against supabase/migrations.
   */
  it("does not claim to keep a verification score nothing writes down", () => {
    const verification = PRIVACY_POLICY.find((section) => section.id === "verification");
    const text = (verification?.body ?? []).join(" ");
    expect(text).toBeTruthy();
    // The image is the claim that must survive.
    expect(text).toMatch(/do not keep the image/i);
    // "We keep whether it passed and a confidence score" was the phrasing.
    expect(text).not.toMatch(/keep[^.]*confidence score/i);
  });

  it("carries an effective date the page can show", () => {
    expect(PRIVACY_POLICY_EFFECTIVE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// §3.5 — this note is the last thing one member says to another. It does not
// get to look like a bug.
describe("closure notes", () => {
  it("signs the template that carries a name", () => {
    expect(renderClosureTemplate(0, "Sam")).toContain("— Sam");
    expect(renderClosureTemplate(0, "Sam")).not.toContain("{name}");
  });

  it("drops the signature entirely when there is no name", () => {
    const rendered = renderClosureTemplate(0);
    expect(rendered).not.toContain("{name}");
    expect(rendered).not.toMatch(/—\s*$/);
    expect(rendered.endsWith("Wishing you a real one.")).toBe(true);
  });

  it.each([undefined, null, "", "   "])("treats %s as no name", (value) => {
    expect(renderClosureTemplate(0, value)).not.toMatch(/—\s*$/);
  });

  it("falls back to the default template for an unknown index", () => {
    expect(renderClosureTemplate(99, "Sam")).toBe(renderClosureTemplate(0, "Sam"));
    expect(renderClosureTemplate(-1, "Sam")).toBe(renderClosureTemplate(0, "Sam"));
  });

  it("leaves the templates without a name placeholder untouched", () => {
    for (let i = 1; i < CLOSURE_TEMPLATES.length; i++) {
      expect(renderClosureTemplate(i, "Sam")).toBe(CLOSURE_TEMPLATES[i]);
      expect(renderClosureTemplate(i)).toBe(CLOSURE_TEMPLATES[i]);
    }
  });
});
