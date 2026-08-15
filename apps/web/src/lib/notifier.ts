import "server-only";

import { notify } from "@plusone/logic";

/**
 * Which notifier is live.
 *
 * Only the stub exists: Resend's key is still a placeholder. When it lands, a
 * real implementation of `notify.Notifier` slots in here and nothing else
 * changes — the payload was already built and checked before it reached the
 * provider.
 *
 * The stub refuses to construct in production, so a deploy that forgot to pick
 * a real one fails loudly rather than silently sending nothing. A notifier that
 * quietly discards is worse than none, because nothing looks broken.
 */
export function notifier(): notify.Notifier {
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
