import { describe, expect, it } from "vitest";

import {
  CONTENT_BLIND_BANNED_TERMS,
  EMAIL_SUBJECT,
  NOTIFICATIONS,
  NEARBY_JOIN_MIN_COUNT,
  PUSH_APP_NAME,
  type NotificationEvent,
  NOTIFICATION_ICONS,
} from "@plusone/config";

import {
  ContentBlindViolation,
  assertContentBlind,
  buildPayload,
  createStubNotifier,
  planDeliveries,
  shouldSendNearbyJoins,
  type NotificationDelivery,
  type NotificationPayload,
} from "./index";

const EVENTS = Object.keys(NOTIFICATIONS) as NotificationEvent[];

describe("every template builds a clean payload", () => {
  it.each(EVENTS)("%s", (event) => {
    const payload = buildPayload(event);
    expect(payload.title).toBe(PUSH_APP_NAME);
    expect(payload.emailSubject).toBe(EMAIL_SUBJECT);
    expect(payload.body.length).toBeGreaterThan(0);
    expect(() => assertContentBlind(payload)).not.toThrow();
  });

  // §8 — the title is the app name, never a person and never a subject. A push
  // that says who it is from is the disclosure the whole matrix prevents.
  it.each(EVENTS)("%s says nothing in its title", (event) => {
    expect(buildPayload(event).title).toBe(PUSH_APP_NAME);
  });

  /**
   * The shape, not the depth. This required a single segment, which every path
   * satisfied by being wrong — they were /drop and /chats when the app lives
   * under /app, so each one was a 404. What matters is that a path carries no
   * identity: no id, no query, no fragment. notification-paths.test.ts checks
   * they resolve to real routes, which this cannot see from here.
   */
  it.each(EVENTS)("%s deep-links without identity or query string", (event) => {
    const { path } = buildPayload(event);
    expect(path).toMatch(/^(\/[a-z-]+)+$/);
    expect(path).not.toContain("?");
    expect(path).not.toContain("=");
    expect(path).not.toContain("#");
    // A uuid or a phone number in a path is the leak this is really guarding.
    expect(path).not.toMatch(/\d/);
  });
});

// A test that the templates are clean proves the templates are clean. It does
// not stop a caller hand-assembling a body from a chat or a profile field.
// This does, because the check is on the OUTPUT and there is no other way to
// get a payload.
describe("the dispatcher refuses to carry a condition word", () => {
  const clean: NotificationPayload = {
    event: "message_received",
    title: PUSH_APP_NAME,
    body: "You have a new message",
    path: "/app/inbox",
    emailSubject: EMAIL_SUBJECT,
    icon: NOTIFICATION_ICONS.message_received,
  };

  it.each(CONTENT_BLIND_BANNED_TERMS)("refuses %s in the body", (term) => {
    expect(() => assertContentBlind({ ...clean, body: `Someone mentioned ${term} today` })).toThrow(
      ContentBlindViolation,
    );
  });

  it.each(["title", "body", "path", "emailSubject"] as const)("checks the %s field", (field) => {
    expect(() => assertContentBlind({ ...clean, [field]: "about your hsv" })).toThrow(
      ContentBlindViolation,
    );
  });

  it("names the field and the term, so the bug is findable", () => {
    try {
      assertContentBlind({ ...clean, body: "your hiv results" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentBlindViolation);
      expect((error as ContentBlindViolation).field).toBe("body");
      expect((error as ContentBlindViolation).term).toBe("hiv");
    }
  });

  // "positively" is not "positive"; "shiv" is not "hsv".
  it("does not fire on a word that merely contains one", () => {
    expect(() =>
      assertContentBlind({ ...clean, body: "Things are going positively" }),
    ).not.toThrow();
    expect(() => assertContentBlind({ ...clean, body: "A new message" })).not.toThrow();
  });

  // Throwing rather than sanitising: a payload that needed cleaning is a bug,
  // and a quietly-cleaned one is a bug that ships.
  it("throws rather than stripping the word", () => {
    expect(() => assertContentBlind({ ...clean, body: "your hiv update" })).toThrow();
  });
});

describe("buildPayload takes an event, not a body", () => {
  /**
   * The first half of content-blindness: there is no parameter through which a
   * name, preview or profile field could arrive.
   *
   * This used to be "accepts exactly one argument", which was the cheapest way
   * to say it while there was only an event. A second one was added on
   * 2026-09-01 so a notification can open the chat rather than the inbox, and
   * counting arguments stopped expressing the rule.
   *
   * What replaces it is stronger, not weaker: the new parameter is checked to
   * be a uuid, so it cannot carry a name whatever a caller passes. The old
   * guard would have been satisfied by a one-argument signature that took a
   * string body; this one would not.
   */
  it("takes an event and an id, and nothing that could be a name", () => {
    expect(buildPayload.length).toBe(2);
  });

  it("refuses to put a non-id in the path", () => {
    // assertContentBlind would catch "Sam's hiv update". It would pass "Sam".
    // The shape check is what stops a display name reaching a URL at all.
    const chat = "3f2a8c1e-9b4d-4f7a-8c2e-1d5b6a9f0e3c";
    expect(buildPayload("message_received", chat).path).toBe(`/app/chats/${chat}`);

    for (const notAnId of ["Sam", "../admin", "sam@example.com", "", "12345"]) {
      expect(buildPayload("message_received", notAnId).path, `"${notAnId}" reached the path`).toBe(
        NOTIFICATIONS.message_received.path,
      );
    }
  });

  it("falls back to the section when there is no subject", () => {
    // Every event still works without one, which is what makes passing it
    // always safe at the call site.
    expect(buildPayload("message_received").path).toBe(NOTIFICATIONS.message_received.path);
    expect(buildPayload("nearby_joins", "3f2a8c1e-9b4d-4f7a-8c2e-1d5b6a9f0e3c").path).toBe(
      NOTIFICATIONS.nearby_joins.path,
    );
  });

  it("gives the same payload for the same event every time", () => {
    expect(buildPayload("fuse_warning")).toEqual(buildPayload("fuse_warning"));
  });
});

describe("planning deliveries", () => {
  it("makes one per recipient per channel", () => {
    const deliveries = planDeliveries("fuse_warning", ["a", "b"], ["push", "email"]);
    expect(deliveries).toHaveLength(4);
    expect(new Set(deliveries.map((d) => d.recipientId))).toEqual(new Set(["a", "b"]));
  });

  it("defaults to push", () => {
    expect(planDeliveries("drop_ready", ["a"]).map((d) => d.channel)).toEqual(["push"]);
  });

  it("plans nothing for nobody", () => {
    expect(planDeliveries("drop_ready", [])).toEqual([]);
  });

  it("carries the same checked payload to every recipient", () => {
    const [first, second] = planDeliveries("chat_closed", ["a", "b"]);
    expect(first?.payload).toEqual(second?.payload);
  });
});

// §8 — "count granularity < 5". In a small town, three is enough to identify
// people, so below the floor nothing is sent rather than something vague.
describe("nearby joins have a floor", () => {
  it.each([0, 1, 4])("does not send for %i", (count) => {
    expect(shouldSendNearbyJoins(count)).toBe(false);
  });

  it.each([5, 6, 50])("sends for %i", (count) => {
    expect(shouldSendNearbyJoins(count)).toBe(true);
  });

  it("uses the configured floor", () => {
    expect(shouldSendNearbyJoins(NEARBY_JOIN_MIN_COUNT)).toBe(true);
    expect(shouldSendNearbyJoins(NEARBY_JOIN_MIN_COUNT - 1)).toBe(false);
  });
});

describe("the stub notifier", () => {
  it("delivers what it is given", async () => {
    const seen: NotificationDelivery[] = [];
    const notifier = createStubNotifier({ sink: (d) => seen.push(d) });
    const result = await notifier.send(planDeliveries("drop_ready", ["a", "b"]));
    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(seen).toHaveLength(2);
  });

  // A provider is the last thing to touch a payload, so it is the last place a
  // leak can be caught. A real one should do this too.
  it("re-checks the payload rather than trusting the caller", async () => {
    const notifier = createStubNotifier();
    const smuggled: NotificationDelivery = {
      recipientId: "a",
      channel: "push",
      payload: {
        event: "message_received",
        title: PUSH_APP_NAME,
        body: "your hsv result is in",
        path: "/app/inbox",
        emailSubject: EMAIL_SUBJECT,
        icon: NOTIFICATION_ICONS.message_received,
      },
    };
    await expect(notifier.send([smuggled])).rejects.toThrow(ContentBlindViolation);
  });

  it("refuses to run in production", () => {
    const previous = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      expect(() => createStubNotifier()).toThrow(/never run in production/);
    } finally {
      process.env["NODE_ENV"] = previous;
    }
  });
});
