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

export const NOTIFICATIONS: Record<NotificationEvent, NotificationTemplate> = {
  drop_ready: { event: "drop_ready", body: "Tonight's Drop is ready", path: "/drop" },
  connect_received: {
    event: "connect_received",
    body: "Someone sent you a connect",
    path: "/inbox",
  },
  connect_accepted: {
    event: "connect_accepted",
    body: "Your connect was accepted",
    path: "/chats",
  },
  message_received: { event: "message_received", body: "You have a new message", path: "/chats" },
  fuse_warning: {
    event: "fuse_warning",
    body: "One of your chats closes tomorrow",
    path: "/chats",
  },
  chat_closed: {
    event: "chat_closed",
    body: "A chat has closed — a note is waiting",
    path: "/chats",
  },
  nearby_joins: { event: "nearby_joins", body: "New members joined near you", path: "/browse" },
  referral_converted: {
    event: "referral_converted",
    body: "Your invite was accepted",
    path: "/invite",
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
