import "server-only";

import { notify } from "@plusone/logic";

import { apnsNotifier } from "./apns";
import { emailNotifier } from "./email";
import { webPushNotifier } from "./web-push";

/**
 * Which notifiers are live — plural, now that there is more than one.
 *
 * This used to return a single provider: web push if VAPID was configured, the
 * stub otherwise. That has an assumption in it which was never true and is now
 * visibly false — that one transport reaches everybody. Push is opt-in, on iOS
 * it is not even offered until the app is on a home screen, and a member who
 * declined it was reached by nothing at all while their settings said email.
 *
 * Each is included by whether its own configuration exists rather than by
 * NODE_ENV. A preview deployment with keys should send; a production one
 * without them should not pretend to. Email is gated on RESEND_FROM rather than
 * the API key, because the key is always present and the verified sender is the
 * thing that actually has to be arranged.
 *
 * The stub survives for a deploy that has neither, and still refuses to
 * construct in production — a notifier that quietly discards is worse than
 * none, because nothing looks broken.
 */
export function notifier(): notify.Notifier {
  const live: notify.Notifier[] = [];

  if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    live.push(webPushNotifier());
  }
  if (process.env.RESEND_FROM && process.env.RESEND_API_KEY) {
    live.push(emailNotifier());
  }
  // All four, because a partial set cannot send and would fail per message.
  if (
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    process.env.APNS_BUNDLE_ID &&
    process.env.APNS_PRIVATE_KEY
  ) {
    live.push(apnsNotifier());
  }
  if (live.length > 0) return notify.composeNotifiers(live);

  return notify.createStubNotifier({
    sink: (delivery) => {
      // Logged with the event and the recipient's opaque id, and nothing else.
      // §9.6 — logs carry opaque ids only, and a log line about a notification
      // is exactly where a body would leak if the payload were interpolated.
      console.info(
        JSON.stringify({
          at: "notification",
          event: delivery.payload.event,
          channel: delivery.channel,
          recipient: delivery.recipientId,
        }),
      );
    },
  });
}
