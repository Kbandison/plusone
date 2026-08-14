import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { CONSENT_COPY_DIGEST, CONSENT_COPY_VERSION, COPY } from "./index";

const COPY_FOR_KIND = {
  health_data: COPY.consent.healthData,
} as const;

describe("consent copy versioning", () => {
  // §9.1 stores copy_version with every consent so a member's tick is tied to
  // the words they actually read. If the words change and the version does not,
  // old consents would silently stand in for new wording — which is the failure
  // this test exists to make impossible to ship.
  it.each(Object.keys(CONSENT_COPY_VERSION) as (keyof typeof CONSENT_COPY_VERSION)[])(
    "fails when %s copy changes without a version bump",
    (kind) => {
      const digest = createHash("sha256").update(COPY_FOR_KIND[kind]).digest("hex").slice(0, 16);
      expect(
        digest,
        `The ${kind} consent copy changed. Bump CONSENT_COPY_VERSION.${kind} and set ` +
          `CONSENT_COPY_DIGEST.${kind} to "${digest}", so members re-consent to the new wording.`,
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
