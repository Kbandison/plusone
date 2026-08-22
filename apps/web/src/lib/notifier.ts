import "server-only";

import { notify } from "@plusone/logic";

import { webPushNotifier } from "./web-push";

/**
 * Which notifier is live.
 *
 * Push is real as of 2026-08-21 — see web-push.ts. Email is still the stub,
 * because Resend's key is still a placeholder, and the seam is what makes that
 * mixture possible: a payload is built and checked before it reaches either.
 *
 * Chosen by whether VAPID is configured rather than by NODE_ENV. A preview
 * deployment with keys should send; a production one without them should not
 * pretend to. The stub still refuses to construct in production, so a deploy
 * that forgot everything fails loudly rather than silently sending nothing — a
 * notifier that quietly discards is worse than none, because nothing looks
 * broken.
 */
export function notifier(): notify.Notifier {
  if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return webPushNotifier();
  }

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
