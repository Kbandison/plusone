import { describe, expect, it } from "vitest";

import {
  CONTENT_BLIND_BANNED_TERMS,
  EMAIL_SUBJECT,
  NOTIFICATIONS,
  PUSH_APP_NAME,
} from "./notifications";
import { PREMIUM_NEVER } from "./pricing";
import { COPY } from "./copy";

/**
 * §8 says the content-blind guarantee is "enforced by a lint rule + payload unit
 * tests". This is that test. If it fails, a payload is leaking — do not weaken the
 * assertion, fix the payload.
 */

function containsBannedTerm(text: string): string | null {
  const haystack = text.toLowerCase();
  for (const term of CONTENT_BLIND_BANNED_TERMS) {
    // Word-boundary match so "statuses" trips but "sta" inside another word doesn't.
    const pattern = new RegExp(
      `(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`,
    );
    if (pattern.test(haystack)) return term;
  }
  return null;
}

describe("notification payloads are content-blind", () => {
  const templates = Object.values(NOTIFICATIONS);

  it("covers every declared event exactly once", () => {
    const events = templates.map((t) => t.event);
    expect(new Set(events).size).toBe(events.length);
    expect(events.length).toBe(8);
  });

  it.each(templates)("$event body carries no condition language", (template) => {
    expect(containsBannedTerm(template.body)).toBeNull();
  });

  it.each(templates)("$event deep link carries no condition language", (template) => {
    expect(containsBannedTerm(template.path)).toBeNull();
  });

  it.each(templates)("$event deep link is a bare app path, not an identity", (template) => {
    // A path with a UUID or query string would leak who or what the push is
    // about. Segments, not a single one: these were /drop and /chats when the
    // app lives under /app, so every one of them was a 404 — a notification
    // whose whole job is bringing somebody back would have landed them on a
    // not-found page.
    expect(template.path).toMatch(/^(\/[a-z-]+)+$/);
    expect(template.path).not.toMatch(/[?#=]/);
    expect(template.path).not.toMatch(/\d/);
  });

  it("email subject reveals nothing beyond the app name", () => {
    expect(containsBannedTerm(EMAIL_SUBJECT)).toBeNull();
    expect(EMAIL_SUBJECT).toBe("⁺One — you have an update");
  });

  it("push app name is the neutral wordmark", () => {
    expect(PUSH_APP_NAME).toBe("⁺One");
    expect(containsBannedTerm(PUSH_APP_NAME)).toBeNull();
  });

  it("no payload names a person or previews a message", () => {
    for (const template of templates) {
      expect(template.body).not.toMatch(/\{.*\}/); // no interpolation slots at all
      expect(template.body.toLowerCase()).not.toContain("from ");
    }
  });
});

describe("banned-term detector", () => {
  it("catches condition language that would leak on a lock screen", () => {
    expect(containsBannedTerm("Someone with HSV liked you")).toBe("hsv");
    expect(containsBannedTerm("Your HIV community has news")).toBe("hiv");
    expect(containsBannedTerm("Update your status")).toBe("status");
  });

  it("does not false-positive on ordinary words", () => {
    expect(containsBannedTerm("Tonight's Drop is ready")).toBeNull();
    expect(containsBannedTerm("You have a new message")).toBeNull();
  });
});

describe("mechanics are never monetised", () => {
  it("keeps the sell-never list intact", () => {
    // §3.3 + Decision #24. Shrinking this list is a product decision, not a refactor.
    expect(PREMIUM_NEVER).toContain("fuse extensions or timer pauses");
    expect(PREMIUM_NEVER).toContain("bypassing the support-only wall");
    expect(PREMIUM_NEVER).toContain("extra drops");
    expect(PREMIUM_NEVER).toContain("visibility or ranking boosts");
  });
});

describe("locked copy", () => {
  it("uses Plus One, never the legal name, in user-facing strings", () => {
    expect(COPY.referral.landingHeadline).toBe("You've been invited to Plus One");
    expect(COPY.consent.healthData.startsWith("Plus One stores")).toBe(true);
    expect(COPY.referral.landingHeadline).not.toContain("YourPlusOne");
    expect(COPY.consent.healthData).not.toContain("YourPlusOne");
  });

  it("keeps the invite landing neutral before tap-through", () => {
    // The invite link gets posted in closed Facebook groups — it must not out anyone.
    expect(containsBannedTerm(COPY.referral.landingHeadline)).toBeNull();
    expect(containsBannedTerm(COPY.referral.landingSub)).toBeNull();
    expect(containsBannedTerm(COPY.referral.landingButton)).toBeNull();
  });
});
