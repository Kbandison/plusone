import {
  CONTENT_BLIND_BANNED_TERMS,
  EMAIL_SUBJECT,
  NOTIFICATIONS,
  PUSH_APP_NAME,
  NEARBY_JOIN_MIN_COUNT,
  type NotificationEvent,
} from "@plusone/config";

/**
 * Notification dispatch (§8, never-cut list).
 *
 * The property this module exists to guarantee:
 *
 *   NOTHING LEAVES THIS FUNCTION CARRYING A CONDITION WORD. `buildPayload` is
 *   the only way to construct one, and it re-checks its own output against the
 *   banned list before returning. A test asserting the templates are clean
 *   proves the templates are clean; it does not stop a future caller
 *   hand-assembling a body from a chat, a name, or a profile field. This does,
 *   because there is no other way to get a payload and this one refuses.
 *
 *   The check is on the OUTPUT rather than the input, so it holds regardless of
 *   how the text was assembled or what it was assembled from.
 *
 * §8 also caps count granularity: "New members joined near you" never says how
 * many below five, because in a small town three is enough to identify people.
 */

export interface NotificationPayload {
  readonly event: NotificationEvent;
  /** Push title. Always the app name — never a person, never a subject. */
  readonly title: string;
  readonly body: string;
  /** Deep link path. No identity, no condition, no query string. */
  readonly path: string;
  /** Every transactional email shares one subject. */
  readonly emailSubject: string;
}

export class ContentBlindViolation extends Error {
  constructor(
    readonly field: string,
    readonly term: string,
  ) {
    super(
      `Refusing to send: ${field} contains "${term}". §8 forbids any condition word ` +
        `in a notification payload, subject or URL.`,
    );
    this.name = "ContentBlindViolation";
  }
}

/** Word-boundary match, so "positively" is not "positive". */
function offendingTerm(text: string): string | null {
  for (const term of CONTENT_BLIND_BANNED_TERMS) {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(text)) return term;
  }
  return null;
}

/** Throws rather than sanitising: a payload that needed cleaning is a bug. */
export function assertContentBlind(payload: NotificationPayload): void {
  const fields: [string, string][] = [
    ["title", payload.title],
    ["body", payload.body],
    ["path", payload.path],
    ["emailSubject", payload.emailSubject],
    ["event", payload.event],
  ];

  for (const [field, value] of fields) {
    const term = offendingTerm(value);
    if (term) throw new ContentBlindViolation(field, term);
  }
}

/**
 * The only way to build a notification.
 *
 * Takes an EVENT, not a body. There is no parameter through which a caller
 * could pass a name, a message preview or a profile field, which is the first
 * half of content-blindness; the output check is the second.
 */
export function buildPayload(
  event: NotificationEvent,
  /**
   * Which row it is about, when that determines a route.
   *
   * Still no parameter through which a caller could pass a name, a preview or a
   * profile field — an id is not one, and `assertContentBlind` checks the path
   * it produces exactly as it checks a static one.
   */
  subjectId?: string,
): NotificationPayload {
  const template = NOTIFICATIONS[event];

  /**
   * The second parameter can carry an id and nothing else.
   *
   * The guard this replaces was "buildPayload accepts exactly one argument",
   * and its reason was the first half of content-blindness: there is no
   * parameter through which a name, a preview or a profile field could arrive.
   * Adding one puts that at risk — `assertContentBlind` would catch a display
   * name containing a condition word, and would happily pass "Sam".
   *
   * So the shape is checked rather than trusted. A value that is not a uuid
   * cannot become part of a path, which means no name can travel this way
   * whatever a caller does.
   *
   * Ignored rather than thrown on. A malformed id is a bug on our side, and the
   * two ways to fail it are losing the notification entirely or sending it to
   * the section instead of the thing. The second is the one a member can still
   * act on.
   */
  const usable =
    subjectId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subjectId)
      ? subjectId
      : null;

  const payload: NotificationPayload = {
    event,
    title: PUSH_APP_NAME,
    body: template.body,
    path: usable && template.pathFor ? template.pathFor(usable) : template.path,
    emailSubject: EMAIL_SUBJECT,
  };

  assertContentBlind(payload);
  return payload;
}

/**
 * §8 — "count granularity < 5". Below the floor the notification is not sent at
 * all rather than sent vaguely: in a small town, "3 people joined near you" and
 * a glance at the room is an identification.
 */
export function shouldSendNearbyJoins(count: number): boolean {
  return count >= NEARBY_JOIN_MIN_COUNT;
}

export type Channel = "push" | "email";

export interface NotificationDelivery {
  readonly recipientId: string;
  readonly channel: Channel;
  readonly payload: NotificationPayload;
}

/**
 * The provider seam. Implementations send; they do not decide what to send, and
 * they never receive anything but a checked payload.
 */
export interface Notifier {
  readonly name: string;
  send(deliveries: readonly NotificationDelivery[]): Promise<{ sent: number; failed: number }>;
}

/**
 * Plans deliveries for an event. Pure: no clock, no network, no provider.
 */
export function planDeliveries(
  event: NotificationEvent,
  recipientIds: readonly string[],
  channels: readonly Channel[] = ["push"],
  subjectId?: string,
): readonly NotificationDelivery[] {
  const payload = buildPayload(event, subjectId);
  return recipientIds.flatMap((recipientId) =>
    channels.map((channel) => ({ recipientId, channel, payload })),
  );
}
