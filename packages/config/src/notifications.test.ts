import { describe, expect, it } from "vitest";

import {
  CONTENT_BLIND_BANNED_TERMS,
  EMAIL_SUBJECT,
  MUTABLE_EVENTS,
  NOTIFICATIONS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DEFAULTS,
  NOTIFY_TIMING,
  PUSH_APP_NAME,
} from "./notifications";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_LINES,
} from "./draft-copy";
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

  /**
   * Against the other exhaustive record, not against a number.
   *
   * This said `toBe(8)`, so adding an event meant editing a literal that says
   * nothing about what is missing. NOTIFICATION_DEFAULTS is
   * Record<NotificationEvent, …>, so TypeScript already refuses to compile an
   * event that has no default — and checking the two against each other means
   * an event added to one and forgotten in the other fails here by name.
   */
  it("covers every declared event exactly once", () => {
    const events = templates.map((t) => t.event);
    expect(new Set(events).size).toBe(events.length);
    expect([...events].sort()).toEqual(Object.keys(NOTIFICATION_DEFAULTS).sort());
  });

  /** Every key is its own event, or a lookup returns somebody else's template. */
  it("keys each template by its own event", () => {
    for (const [key, template] of Object.entries(NOTIFICATIONS)) {
      expect(template.event, key).toBe(key);
    }
  });

  /**
   * Every mutable event must be a real one, and the two that are NOT mutable
   * are deliberate — for different reasons, which is why they are listed rather
   * than counted:
   *
   *   verification_decided  The answer to a question the member cannot proceed
   *                         without. A switch for it is a switch for stranding
   *                         yourself.
   *   beta_signup           Not about the recipient at all. It is operational,
   *                         it only ever goes to the admin roster, and a member
   *                         never receives one — so there is no switch being
   *                         withheld from anybody.
   *
   * A third entry here needs its own sentence. "Not switchable" is the kind of
   * exception that accumulates quietly once there is more than one.
   */
  it("offers a switch for every event but the two nobody should silence", () => {
    for (const event of MUTABLE_EVENTS) expect(NOTIFICATIONS).toHaveProperty(event);
    const all = Object.keys(NOTIFICATION_DEFAULTS);
    expect(all.filter((e) => !MUTABLE_EVENTS.includes(e as never)).sort()).toEqual([
      "beta_signup",
      "verification_decided",
    ]);
  });

  /** A default that names a channel nothing can send is a promise to nobody. */
  it("defaults only to channels that exist", () => {
    for (const [event, channels] of Object.entries(NOTIFICATION_DEFAULTS)) {
      for (const channel of channels) expect(NOTIFICATION_CHANNELS, event).toContain(channel);
      expect(channels.length, event).toBeGreaterThan(0);
    }
  });

  /**
   * In-app is the only channel that never leaves the device, so it is the one
   * every event can afford. An event that defaults to push alone is one a
   * member cannot find again after dismissing the notification.
   */
  it("always keeps a copy in the app", () => {
    for (const [event, channels] of Object.entries(NOTIFICATION_DEFAULTS)) {
      expect(channels, event).toContain("in_app");
    }
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

/**
 * The in-app line is the one place this product says more than §8's payload —
 * and the reason it is allowed to is that it says it by being HANDED a name at
 * render time rather than by having stored one. These are the properties that
 * keep that true.
 */
describe("what the list says", () => {
  it("has a line for every event, and a label for every switch", () => {
    expect(Object.keys(NOTIFICATION_LINES).sort()).toEqual(
      Object.keys(NOTIFICATION_DEFAULTS).sort(),
    );
    expect(Object.keys(NOTIFICATION_EVENT_LABELS).sort()).toEqual(
      Object.keys(NOTIFICATION_DEFAULTS).sort(),
    );
    expect(Object.keys(NOTIFICATION_CHANNEL_LABELS).sort()).toEqual(
      [...NOTIFICATION_CHANNELS].sort(),
    );
  });

  /**
   * Behind the login is not a licence. The list renders on a phone somebody
   * else can see, and a room named for a diagnosis must not be nameable from
   * a notification about a post in it.
   */
  it("never names a condition, with a name or without one", () => {
    for (const [event, line] of Object.entries(NOTIFICATION_LINES)) {
      expect(containsBannedTerm(line(null)), event).toBeNull();
      expect(containsBannedTerm(line("Sam")), event).toBeNull();
    }
  });

  /**
   * A null actor is the ordinary case, not the edge one: the system causes half
   * of these, and for the rest my_notifications resolves the name through
   * visible_profiles — so a block, a deletion or an anonymous post all arrive
   * here as null.
   */
  it("says something whole when there is no name to say", () => {
    for (const [event, line] of Object.entries(NOTIFICATION_LINES)) {
      const text = line(null);
      expect(text.length, event).toBeGreaterThan(10);
      expect(text, event).not.toMatch(/null|undefined/);
      // A leading space or a stray comma is what an interpolated empty name
      // looks like once it has been rendered.
      expect(text, event).toBe(text.trim());
      expect(text, event).not.toMatch(/^[,.—-]/);
    }
  });

  /**
   * Two of them take the name and drop it. A like is the one interaction the
   * rooms do not attribute anywhere — the post shows a count and never who —
   * so naming the liker here would invent a disclosure the interface
   * deliberately does not make. And nothing about a moderator reaches the
   * member they decided about.
   */
  it("keeps the un-attributed events un-attributed", () => {
    expect(NOTIFICATION_LINES.like_received("Sam")).toBe(NOTIFICATION_LINES.like_received(null));
    expect(NOTIFICATION_LINES.verification_decided("Sam")).toBe(
      NOTIFICATION_LINES.verification_decided(null),
    );
  });
});

describe("every switch is a switch for something that happens", () => {
  it("offers no channel an event does not actually use", () => {
    // A ticked box on a channel outside NOTIFICATION_DEFAULTS is inert: the
    // dispatcher sends the default list, and a mute row for a channel that was
    // never in it does nothing. The grid renders those cells as a dash, and
    // this is the invariant that makes that correct.
    for (const event of MUTABLE_EVENTS) {
      expect(NOTIFICATION_DEFAULTS[event].length, event).toBeGreaterThan(0);
    }
  });

  /**
   * The one that cannot be turned off, and it is deliberate rather than
   * forgotten: a member waiting on a human to look at their account has
   * nothing to do but check, and a switch for it is a switch for stranding
   * themselves. set_notification_mute refuses it in the database too.
   */
  it("withholds exactly two switches, and says which", () => {
    // Named, never counted. The two are unswitchable for different reasons —
    // verification_decided because silencing it strands the member, beta_signup
    // because it is operational and never reaches one — and a third would need
    // its own sentence rather than a bumped number.
    const missing = Object.keys(NOTIFICATION_DEFAULTS).filter(
      (event) => !(MUTABLE_EVENTS as readonly string[]).includes(event),
    );
    expect(missing.sort()).toEqual(["beta_signup", "verification_decided"]);
  });

  it("keeps every notification in the app even when the phone is silenced", () => {
    // in_app is the copy that survives a dismissed push. An event that skipped
    // it would be one a member could miss permanently.
    for (const [event, channels] of Object.entries(NOTIFICATION_DEFAULTS)) {
      expect(channels, event).toContain("in_app");
    }
  });
});

describe("when the timed ones fire", () => {
  /**
   * A warning that arrives after the thing it warns about is not a warning, and
   * one that arrives a month early is a nag nobody will still be holding when
   * it matters.
   */
  it("gives notice measured in hours or days, not minutes or months", () => {
    expect(NOTIFY_TIMING.connectExpiryWarningHours).toBeGreaterThanOrEqual(6);
    expect(NOTIFY_TIMING.connectExpiryWarningHours).toBeLessThan(24 * 3);
    expect(NOTIFY_TIMING.premiumExpiryWarningDays).toBeGreaterThanOrEqual(1);
    expect(NOTIFY_TIMING.premiumExpiryWarningDays).toBeLessThanOrEqual(14);
    expect(NOTIFY_TIMING.nearbyJoinWindowDays).toBeGreaterThanOrEqual(7);
  });
});
