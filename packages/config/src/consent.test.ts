import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  BANNED_PRIVACY_CLAIMS,
  CONSENT_COPY_DIGEST,
  CONSENT_COPY_VERSION,
  COPY,
  HEALTH_DATA_ANCHOR,
  PRIVACY_POLICY,
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_INTRO,
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
    expect(Object.keys(CONSENT_COPY_VERSION).sort()).toEqual(Object.keys(CONSENT_COPY_DIGEST).sort());
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
  const all = [PRIVACY_POLICY_INTRO, ...PRIVACY_POLICY.flatMap((s) => [...s.body, ...(s.list ?? [])])];

  // §9.1's consent screen links to /privacy#health-data. If the section is
  // renamed, the link silently goes nowhere — so the anchor is asserted.
  it("has the health-data section the consent screen links to", () => {
    expect(PRIVACY_POLICY.map((s) => s.id)).toContain(HEALTH_DATA_ANCHOR);
  });

  // These words may appear only as denials. "Not end-to-end encrypted" is honest
  // and important to say; "encrypted" as a promise would not be true, since
  // E2EE is out for v1. The rule is per sentence rather than per adjacent word,
  // because the negation is rarely the word immediately before.
  it("uses a banned claim only to deny it, never to promise it", () => {
    for (const text of all) {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        for (const claim of BANNED_PRIVACY_CLAIMS) {
          if (!new RegExp(`\\b${claim}`, "i").test(sentence)) continue;
          expect(
            sentence,
            `"${sentence}" uses "${claim}" without denying it`,
          ).toMatch(/\b(not|never|no)\b/i);
        }
      }
    }
  });

  it("says plainly that messages are not end-to-end encrypted", () => {
    const messages = PRIVACY_POLICY.find((s) => s.id === "messages");
    expect(messages?.body.join(" ")).toContain("not end-to-end encrypted");
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

  it("carries an effective date the page can show", () => {
    expect(PRIVACY_POLICY_EFFECTIVE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
