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
  | "connect_expiring"
  | "message_received"
  | "fuse_warning"
  | "chat_closed"
  | "plan_proposed"
  | "plan_confirmed"
  | "like_received"
  | "reply_received"
  | "mention_received"
  | "verification_decided"
  | "premium_expiring"
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
  /**
   * §6.3 — a connect expires kindly after seven days rather than lingering.
   * Told BEFORE it does, because the whole point of the deadline is that
   * somebody decides, and a deadline nobody is told about is just a deletion.
   */
  connect_expiring: {
    event: "connect_expiring",
    body: "A connect is waiting on you",
    path: "/app/inbox",
  },
  /**
   * §6.2 — a plan is the point. These two were missing entirely, which meant
   * the most consequential thing that can happen in a chat happened silently.
   */
  plan_proposed: { event: "plan_proposed", body: "Someone proposed a plan", path: "/app/inbox" },
  plan_confirmed: { event: "plan_confirmed", body: "A plan is confirmed", path: "/app/inbox" },
  like_received: { event: "like_received", body: "Someone liked your post", path: "/app/rooms" },
  /**
   * "to you", not "to your post".
   *
   * This fires to the author of whatever was replied to, and a room thread is
   * two levels deep — so that is a post for a comment and a COMMENT for a
   * reply. It said "replied to your post" either way, which is wrong half the
   * time and wrong in the direction that sends somebody looking for something
   * that is not there. The in-app line says which; a push cannot, and does not
   * pretend to.
   */
  reply_received: { event: "reply_received", body: "Someone replied to you", path: "/app/rooms" },
  /**
   * Being tagged.
   *
   * A thread is two levels deep and no deeper, so answering a REPLY has nowhere
   * to nest — the product puts the person's name in the box instead and the
   * reply sits beside the others. Nobody told them. reply_received goes to the
   * author of the row it nests under, which is the COMMENT above, so the person
   * actually being answered was the one participant never notified.
   *
   * The room is never named. Rooms here are named for a diagnosis, so "@Cedar
   * mentioned you in …" would put the one word §8 exists to keep off a lock
   * screen onto one.
   */
  mention_received: {
    event: "mention_received",
    body: "Someone mentioned you",
    path: "/app/rooms",
  },
  /**
   * A member who is mid-signup and waiting on a human is the one person here
   * with nothing to do but check. §7.2 makes verification a step, and a step
   * that finishes silently is a member who never comes back.
   */
  verification_decided: {
    event: "verification_decided",
    body: "Your verification has been reviewed",
    path: "/app",
  },
  premium_expiring: {
    event: "premium_expiring",
    body: "Your premium is ending soon",
    path: "/app/settings/premium",
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

/**
 * Where a notification can go.
 *
 * `in_app` is new and is not like the other two. Push and email leave the
 * device and land somewhere a bystander may see, which is why buildPayload
 * refuses a condition word and every template says as little as it can. An
 * in-app notification is behind the login, on a screen that is already showing
 * names and messages — so it can say who and about what, and it does, by
 * storing WHAT HAPPENED rather than a sentence.
 *
 * That difference is why the in-app row carries references — an event, an actor,
 * a subject — and no text at all. The list is rendered at read time with the
 * member's own permissions, so a name they may no longer see (a block, a
 * deletion, an anonymous post) is simply not rendered. A stored sentence would
 * have frozen it.
 */
export const NOTIFICATION_CHANNELS = ["in_app", "push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Which channels an event uses unless a member says otherwise.
 *
 * Off by default is the safer direction for anything that leaves the device.
 * Email is off everywhere: §8 gives every transactional email one subject and
 * puts the content behind the login, so an email adds a line in an inbox and
 * nothing else — it is there for the member who wants it, not as a default.
 *
 * `like_received` gets in-app only. A like is the smallest possible event and
 * the one most likely to arrive in bursts; buzzing a phone for each is the
 * engagement loop §3.3 bans, and a member who wants it can turn it on.
 *
 * ALL of this is Claude's judgement, not Kevin's decision. The events are his;
 * which channel each one takes by default is not.
 */
export const NOTIFICATION_DEFAULTS: Record<NotificationEvent, readonly NotificationChannel[]> = {
  drop_ready: ["in_app", "push"],
  connect_received: ["in_app", "push"],
  connect_accepted: ["in_app", "push"],
  connect_expiring: ["in_app", "push"],
  message_received: ["in_app", "push"],
  fuse_warning: ["in_app", "push"],
  chat_closed: ["in_app", "push"],
  plan_proposed: ["in_app", "push"],
  plan_confirmed: ["in_app", "push"],
  like_received: ["in_app"],
  reply_received: ["in_app", "push"],
  /**
   * Push, like a reply — because it IS one, mechanically. Being tagged is how
   * this product expresses answering somebody at the third level, and a member
   * who is buzzed when their comment is answered and silent when they are
   * answered by name would be told about the shallower of the two.
   */
  mention_received: ["in_app", "push"],
  verification_decided: ["in_app", "push"],
  premium_expiring: ["in_app", "email"],
  nearby_joins: ["in_app"],
  referral_converted: ["in_app"],
};

/**
 * The events a member is offered a switch for, in the order they are shown.
 *
 * Not every event: `verification_decided` is the answer to a question the
 * member asked and cannot proceed without, and offering to silence it is
 * offering to strand themselves. It is the one that cannot be turned off, and
 * saying so is better than hiding the row.
 */
export const MUTABLE_EVENTS: readonly NotificationEvent[] = [
  "drop_ready",
  "connect_received",
  "connect_accepted",
  "connect_expiring",
  "message_received",
  "plan_proposed",
  "plan_confirmed",
  "fuse_warning",
  "chat_closed",
  "reply_received",
  "mention_received",
  "like_received",
  "premium_expiring",
  "nearby_joins",
  "referral_converted",
];

/**
 * When the timed ones fire.
 *
 * All three exist because the event does. A connect expires after seven days
 * (CONNECTS.pendingExpiryDays) and until now nothing said so — which makes a
 * deadline indistinguishable from a deletion, since the member who was asked
 * simply finds the row gone. The others are the same shape: something the app
 * was already going to do, silently, on a schedule.
 *
 * The numbers are Claude's, not Kevin's. A day's notice on a connect matches
 * the fuse warning's 24 hours, three days on a lapsing subscription is enough
 * to do something about it without nagging, and a week is the shortest window
 * over which "new people are here" can be true without being a daily nudge.
 */
export const NOTIFY_TIMING = {
  /** Hours before a pending connect expires that the person asked is told. */
  connectExpiryWarningHours: 24,
  /** Days before a subscription's period ends that the member is told. */
  premiumExpiryWarningDays: 3,
  /** How far back "new" reaches, and how often a member can be told at all. */
  nearbyJoinWindowDays: 7,
} as const;
