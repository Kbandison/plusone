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
export function buildPayload(event: NotificationEvent): NotificationPayload {
  const template = NOTIFICATIONS[event];

  const payload: NotificationPayload = {
    event,
    title: PUSH_APP_NAME,
    body: template.body,
    path: template.path,
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
): readonly NotificationDelivery[] {
  const payload = buildPayload(event);
  return recipientIds.flatMap((recipientId) =>
    channels.map((channel) => ({ recipientId, channel, payload })),
  );
}
