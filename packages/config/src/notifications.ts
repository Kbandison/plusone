/**
 * §8 — the notification matrix. EVERY payload is content-blind.
 *
 * No name, no photo, no message preview, no sender identity, no count granularity
 * below 5, and no condition word anywhere in a title, body, subject, URL, or
 * analytics event name. This is enforced by `notifications.test.ts`, not by review.
 */

export type NotificationEvent =
  | "drop_ready"
  | "connect_received"
  | "connect_accepted"
  | "message_received"
  | "fuse_warning"
  | "chat_closed"
  | "nearby_joins"
  | "referral_converted";

export interface NotificationTemplate {
  readonly event: NotificationEvent;
  readonly body: string;
  /** Deep link path. Must never encode identity or condition in the URL. */
  readonly path: string;
}

/**
 * Every path is a real route, which none of them were.
 *
 * These were written before the app had routes and never revisited: /drop,
 * /inbox, /chats, /browse and /invite. The app lives under /app, so every one
 * of them was a 404 — a notification whose entire job is to bring somebody back
 * would have landed them on a not-found page. Nothing caught it because nothing
 * had ever delivered one.
 *
 * `notification-paths.test.ts` now checks each against the built route manifest,
 * so the next renamed segment fails a test rather than a member's evening.
 *
 * Two of them also moved to where the thing actually is. A connect arrives in
 * the inbox and the chat it becomes is in the inbox too — /app/chats exists but
 * the inbox is the list a member is sent to.
 */
export const NOTIFICATIONS: Record<NotificationEvent, NotificationTemplate> = {
  drop_ready: { event: "drop_ready", body: "Tonight's Drop is ready", path: "/app" },
  connect_received: {
    event: "connect_received",
    body: "Someone sent you a connect",
    path: "/app/inbox",
  },
  connect_accepted: {
    event: "connect_accepted",
    body: "Your connect was accepted",
    path: "/app/inbox",
  },
  message_received: {
    event: "message_received",
    body: "You have a new message",
    path: "/app/inbox",
  },
  fuse_warning: {
    event: "fuse_warning",
    body: "One of your chats closes tomorrow",
    path: "/app/inbox",
  },
  chat_closed: {
    event: "chat_closed",
    body: "A chat has closed — a note is waiting",
    path: "/app/inbox",
  },
  nearby_joins: { event: "nearby_joins", body: "New members joined near you", path: "/app/browse" },
  referral_converted: {
    event: "referral_converted",
    body: "Your invite was accepted",
    path: "/app/invite",
  },
} as const;

/** App name shown in push payloads. */
export const PUSH_APP_NAME = "⁺One" as const;

/** Every transactional email uses this subject. Content lives behind the login. */
export const EMAIL_SUBJECT = "⁺One — you have an update" as const;

/**
 * §8 — "count granularity < 5". Nearby-join counts are bucketed so a small local
 * pool can't be used to infer who joined.
 */
export const NEARBY_JOIN_MIN_COUNT = 5;

/**
 * Words that must never appear in a notification payload, email subject, deep-link
 * path, or analytics event name. Checked case-insensitively by the test suite.
 *
 * This is deliberately broader than the condition enums: a push preview on a lock
 * screen is visible to anyone holding the phone.
 */
export const CONTENT_BLIND_BANNED_TERMS = [
  "hsv",
  "hiv",
  "herpes",
  "undetectable",
  "u=u",
  "diagnosis",
  "positive",
  "status",
  "condition",
  "outbreak",
  "std",
  "sti",
] as const;
