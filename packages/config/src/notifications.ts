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
  | "activity_nearby"
  | "referral_converted"
  /**
   * Operational, and the only event here that is not about the recipient.
   *
   * Everything else in this union happened TO the person receiving it. This one
   * tells whoever runs the beta that somebody joined it, which is a different
   * kind of thing — so it is deliberately kept out of MUTABLE_EVENTS, the way
   * `verification_decided` is, and never appears among a member's switches.
   */
  | "beta_signup";

export interface NotificationTemplate {
  readonly event: NotificationEvent;
  readonly body: string;
  /**
   * Where the notification goes when there is nothing to be specific about.
   *
   * Must never encode identity or condition. This one is a constant, so it
   * cannot.
   */
  readonly path: string;
  /**
   * Where it goes when we know WHICH thing it is about.
   *
   * ── why an id in the path is allowed and a word is not ──────────────────
   *
   * The rule this sits under is §8 content-blindness, and its subject is what
   * a notification DISPLAYS: a lock screen shows the title and the body, and
   * those may never carry a name, a message or a condition. The path is not
   * displayed anywhere — the service worker reads it out of `data` when the
   * member taps, and Chrome keeps `data` to itself rather than putting it in
   * the Android notification's extras. `assertContentBlind` still checks it,
   * so a path that ever gained a word would be refused.
   *
   * What travels is an opaque uuid. It says which row, to somebody who can
   * already read that row, and nothing to anybody else. The payload carrying
   * it is encrypted end to end with the subscription's own keys, so no push
   * service sees it either.
   *
   * Kevin asked for this on 2026-09-01: "the notification should take you to
   * where the notification comes from" — a message should open the chat rather
   * than the inbox, with the id "as secure as possible".
   *
   * Only where the subject id DETERMINES a route. A room like or a reply has
   * the message id, and a message id alone does not name a room — so those
   * keep their static path rather than guessing.
   */
  readonly pathFor?: (subjectId: string) => string;
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
    pathFor: (id) => `/app/chats/${id}`,
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
    pathFor: (id) => `/app/chats/${id}`,
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
  plan_proposed: {
    event: "plan_proposed",
    body: "Someone proposed a plan",
    path: "/app/inbox",
    pathFor: (id) => `/app/chats/${id}`,
  },
  plan_confirmed: {
    event: "plan_confirmed",
    body: "A plan is confirmed",
    path: "/app/inbox",
    pathFor: (id) => `/app/chats/${id}`,
  },
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
  /**
   * A new beta tester, to whoever runs the beta.
   *
   * ── it names nobody, and that is not merely §8 compliance ───────────────────
   *
   * Content-blindness exists because a notification lands on a lock screen, and
   * an admin's lock screen is still a lock screen — read over a shoulder, on a
   * shared desk, in front of whoever is in the room. "Someone joined the beta"
   * on a phone says nothing about anybody; the same line carrying an email
   * address is a member of an HSV and HIV app named on a screen the person it
   * names never agreed to appear on.
   *
   * The address is one tap away in /admin/waitlist, behind a session and a
   * roster check, which is where it belongs.
   *
   * No count either, for the reason §8 gives about count granularity: "3 people
   * joined" is a figure about a real population, and this list is small enough
   * early on that the number is close to naming individuals.
   */
  beta_signup: {
    event: "beta_signup",
    body: "Someone joined the beta",
    path: "/admin/waitlist",
  },
  nearby_joins: { event: "nearby_joins", body: "New members joined near you", path: "/app/browse" },
  /**
   * The premium activity alert (server 18c). Same content-blind sentence for
   * everybody, and deliberately no number in it — `claim_activity_alerts`
   * returns a count and it is used to decide WHETHER to send, never what to
   * say. A number on a lock screen is the granularity §8 spends a rule
   * refusing, and the floor is the same five.
   */
  activity_nearby: {
    event: "activity_nearby",
    body: "People are active near you",
    path: "/app/browse",
  },
  referral_converted: {
    event: "referral_converted",
    body: "Your invite was accepted",
    path: "/app/invite",
  },
} as const;

/** App name shown in push payloads. */
export const PUSH_APP_NAME = "⁺One" as const;

/**
 * The events that arrive SILENTLY. Everything else may make a sound.
 *
 * ── this list was the other way round, and that was wrong ───────────────────
 *
 * It used to name the two events that could alert, and silence everything else
 * on the reading that §3.3 forbids the app nudging a member. Kevin's call
 * 2026-09-01 inverts it, and the argument is his: a member has to know somebody
 * wrote to them. A notification that never peeks and never sounds goes to the
 * tray and is found when they next look — which for a message is the same as
 * not sending it.
 *
 * §3.3 is intact, because the line it draws is narrower than "no sound". It
 * forbids the APP manufacturing a reason to come back. It does not forbid
 * telling somebody that a person acted:
 *
 *   a person acted        a message, a connect, a reply, a plan. Somebody chose
 *                         to reach the member. That is not the app nudging
 *                         anybody, and silencing it protects nobody.
 *   a deadline moved      the fuse warning, a chat closing. Time-bound, and
 *                         useless after the fact.
 *   the app decided       "new members joined near you", "somebody liked your
 *                         post", "your premium is ending". Nobody addressed the
 *                         member. These are exactly what §3.3 is about and they
 *                         stay silent.
 *
 * `nearby_joins` is the clearest case: `claim_nearby_joins` already names it as
 * the §3.3 engagement loop in its own migration. It arrives in the tray and
 * makes no sound, forever.
 *
 * ── this list is duplicated in sw.js, and has to be ─────────────────────────
 *
 * `public/sw.js` is plain JavaScript served as a static file and cannot import
 * from a workspace package, so the same names are literals there and
 * `push.test.ts` fails when the two stop agreeing. `silent` and `renotify`
 * throw when combined, so an event is one or the other.
 */
export const PUSH_SILENT: readonly NotificationEvent[] = [
  "like_received",
  "nearby_joins",
  "activity_nearby",
  "premium_expiring",
  "referral_converted",
];

/** Every transactional email uses this subject. Content lives behind the login. */
export const EMAIL_SUBJECT = "⁺One — you have an update" as const;

/**
 * The two lines the branded email adds around a payload, and nothing else.
 *
 * Kept here rather than in the mailer so they are checked by the same tests as
 * the rest of the matrix: both are content-blind, and the action label has to
 * say where somebody is going without saying what they will find.
 *
 * The footers differ because the senders do. A notification can be turned off
 * and saying so is honest; the waitlist confirmation has no member behind it,
 * no preference to respect and no Settings to reach, so pointing that recipient
 * at a switch they do not have would invent a relationship that does not exist.
 */
export const EMAIL_ACTION_LABEL = "Open ⁺One" as const;
export const EMAIL_NOTIFICATION_FOOTER = "You can turn these off in Settings." as const;
export const EMAIL_DIRECT_FOOTER =
  "You are receiving this because this address was entered on loveplusone.app." as const;

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
 * NO EVENT DEFAULTS TO EMAIL, and that is now Kevin's decision rather than an
 * unfinished state. Confirmed 2026-08-26, once the sending domain was verified
 * and `RESEND_FROM` was set — the moment email became possible was the moment
 * the question had to be answered rather than deferred.
 *
 * The reasoning it settles: email persists and is searchable in a way a push
 * that is dismissed is not, and an inbox is read over shoulders, forwarded, and
 * synced to machines a member does not control. §8 keeps a condition word off a
 * lock screen; the same argument applies with more force to something that sits
 * in a mailbox for years. A member who wants it can switch it on per event, and
 * the Email column has been on the settings screen the whole time.
 *
 * `notification-defaults.test.ts` holds the line, because the failure here is
 * somebody adding an event and copying the wrong row.
 *
 * The rest of this is Claude's judgement, not Kevin's decision. The events are
 * his; which of in_app and push each one takes by default is not.
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
  /**
   * Push rather than email, changed 2026-08-26 to match Kevin's decision that no
   * event defaults to email.
   *
   * It was `["in_app", "email"]` — the only entry in this table that used email,
   * and the only one with no comment saying why, while every other deliberate
   * choice here has one. The record had been asserting the opposite for days
   * ("every entry is still in_app, push"), so nobody knew it was there.
   *
   * The argument FOR email on this one is real and worth writing down, because
   * it may well be revisited: a lapsing subscription is a billing notice, email
   * is the conventional channel for one, and persisting is a feature rather than
   * a risk when somebody needs to find it later. It is also the least sensitive
   * event in the table — "your subscription is ending" says nothing about who
   * the member is. If that argument wins, this is the entry to change, and the
   * test that guards it names itself.
   */
  premium_expiring: ["in_app", "push"],
  nearby_joins: ["in_app"],
  /**
   * In-app only by default, like nearby_joins, and for the same §3.3 reason —
   * "come back, there are new people" is the engagement loop this product
   * refuses to run.
   *
   * What makes this one defensible on a PAID tier is that §3.3 bans the APP
   * nudging a member, and this alert does not exist until the member creates
   * it, on a radius they chose, and can be deleted in one press. Push is
   * available and off: a member who turns it on has asked to be interrupted,
   * which is control rather than a loop. Nobody is ever opted in.
   */
  activity_nearby: ["in_app"],
  referral_converted: ["in_app"],
  /**
   * Push and in-app, never email.
   *
   * Kevin asked for push, and the in-app row comes with it for free through
   * notify() — worth keeping rather than suppressing, because it is the record
   * that survives a push nobody saw. Email is left off deliberately: this fires
   * once per signup and an inbox is the wrong place for something already on a
   * lock screen and already listed on /admin/waitlist.
   */
  beta_signup: ["push", "in_app"],
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
  "activity_nearby",
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
  /** How recently somebody must have been seen to count as active. */
  activityAlertWindowHours: 24,
  /** The shortest gap between two activity alerts for the same member. */
  activityAlertCooldownHours: 24,
  /**
   * The local hours an activity alert may be delivered in, half-open.
   *
   * profiles.timezone is real and set by timezone-actions.ts, so this is the
   * member's own clock rather than the server's — the same thing
   * claim_drop_notifications does with DROP.hourLocal. A member who has not
   * opened the app since 20260821000500 shipped is still 'UTC', which makes
   * this the wrong hour for them rather than a broken one.
   */
  activityAlertFromHourLocal: 9,
  activityAlertToHourLocal: 21,
} as const;
