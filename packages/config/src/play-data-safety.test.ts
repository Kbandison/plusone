import { describe, expect, it } from "vitest";

import {
  APPLE_CATEGORIES_COVERED,
  PLAY_DATA_SAFETY,
  PLAY_NOT_COLLECTED,
  PLAY_NO_ADVERTISING,
  PLAY_SECURITY,
} from "./play-data-safety";
import { NOT_COLLECTED, PRIVACY_LABELS, TRACKING } from "./privacy-labels";

/**
 * Two public legal declarations about one schema.
 *
 * The Apple labels are already held against the migrations — a table nothing
 * classifies fails that test. This holds the Play answers against the Apple
 * ones, so the chain runs all the way from a new column to both stores. What it
 * is really guarding against is the two forms being filled in months apart, by
 * whoever is closest to the deadline, and quietly disagreeing.
 */
describe("the Play answers cover the same facts as the Apple ones", () => {
  it("represents every Apple category somewhere", () => {
    // The failure this catches: somebody adds a label for a new column, the
    // Apple form gets it, and Play silently keeps declaring less than the app
    // does. Under-declaring is the direction that gets found later.
    const mapped = new Set(
      PLAY_DATA_SAFETY.map((entry) => entry.fromAppleCategory).filter((c) => c !== null),
    );
    for (const category of APPLE_CATEGORIES_COVERED) {
      expect(mapped, `no Play data type maps to "${category}"`).toContain(category);
    }
  });

  it("keeps the Apple label list as the source, not a copy", () => {
    expect(APPLE_CATEGORIES_COVERED).toEqual(PRIVACY_LABELS.map((l) => l.category));
  });

  it("only lets an entry skip the Apple mapping if it is processed ephemerally", () => {
    // The one legitimate case is the liveness selfie, which Apple's form cannot
    // express. Anything else arriving here unmapped is an answer nobody checked
    // against the schema.
    for (const entry of PLAY_DATA_SAFETY.filter((e) => e.fromAppleCategory === null)) {
      expect(entry.processedEphemerally, `${entry.type} is unmapped but retained`).toBe(true);
    }
  });

  it("declares the liveness selfie, which the Apple side holds for counsel", () => {
    const ephemeral = PLAY_DATA_SAFETY.filter((e) => e.processedEphemerally);
    expect(ephemeral).toHaveLength(1);
    expect(ephemeral[0]?.purposes).toContain("Fraud prevention, security, and compliance");
    // And the Apple side must still be carrying its held note, so the two are
    // reconcilable by whoever reads them next.
    const held = NOT_COLLECTED.find((n) => n.category.includes("biometric"));
    expect(held?.because).toMatch(/HELD FOR COUNSEL/);
  });
});

describe("the answers that would be wrong the moment an SDK is added", () => {
  it("shares nothing with anybody", () => {
    // A processor acting on our instructions is not "sharing" in Play's sense,
    // which is why Rekognition and the payment processors do not flip this.
    for (const entry of PLAY_DATA_SAFETY) {
      expect(entry.shared, `${entry.type} is declared shared`).toBe(false);
    }
  });

  it("ticks no advertising or marketing purpose", () => {
    // Not in the PlayPurpose union at all, so this is really asserting the type
    // has not been widened — which is how it would happen.
    const purposes = PLAY_DATA_SAFETY.flatMap((e) => e.purposes as readonly string[]);
    expect(purposes).not.toContain("Advertising or marketing");
    expect(purposes).not.toContain("Analytics");
    expect(purposes).not.toContain("Personalization");
  });

  it("stays consistent with the Apple tracking answer", () => {
    expect(TRACKING.used).toBe(false);
    expect(PLAY_NO_ADVERTISING.containsAds).toBe(false);
  });
});

describe("the NO answers, which are claims rather than blanks", () => {
  it("collects approximate location and refuses precise", () => {
    const types = PLAY_DATA_SAFETY.map((e) => e.type);
    expect(types).toContain("Location → Approximate location");
    expect(PLAY_NOT_COLLECTED).toContain("Location → Precise location");
    expect(types).not.toContain("Location → Precise location" as never);
  });

  it("declares purchase history and never payment info", () => {
    const types = PLAY_DATA_SAFETY.map((e) => e.type);
    expect(types).toContain("Financial info → Purchase history");
    expect(PLAY_NOT_COLLECTED).toContain("Financial info → User payment info");
  });

  it("keeps every no in step with the Apple form's no", () => {
    // Both forms must refuse precise location and payment info for the same
    // stated reasons; if one starts collecting them the other is now a lie.
    const appleNos = NOT_COLLECTED.map((n) => n.category).join(" | ");
    expect(appleNos).toMatch(/Precise Location/);
    expect(appleNos).toMatch(/Payment Info/);
  });
});

describe("the security section", () => {
  it("promises deletion, which the app actually implements", () => {
    // `requestDeletion` in settings/actions.ts calls request_deletion, and
    // legal.ts §deletion promises it in as many words. Answering no here would
    // contradict a published policy.
    expect(PLAY_SECURITY.usersCanRequestDeletion).toBe(true);
    expect(PLAY_SECURITY.encryptedInTransit).toBe(true);
  });

  it("gives a deletion route that does not need the app", () => {
    // Play asks for this SEPARATELY from the in-app path and it is the half
    // people miss: a member who has already uninstalled must still be able to
    // ask. It has to be reachable in a browser, on the canonical origin.
    expect(PLAY_SECURITY.deletionUrl).toMatch(/^https:\/\/www\.loveplusone\.app\//);
    expect(PLAY_SECURITY.deletionUrl).toContain("#deletion");
  });
});

describe("every entry is answerable by a person filling the form", () => {
  it("says why, in words, for each one", () => {
    for (const entry of PLAY_DATA_SAFETY) {
      expect(entry.why.length, `${entry.type} has no reasoning`).toBeGreaterThan(40);
      expect(entry.purposes.length, `${entry.type} has no purpose`).toBeGreaterThan(0);
    }
  });
});
