import type { Notifier } from "./notify";

/**
 * Several notifiers as one, because a member is reachable more than one way.
 *
 * `notifier()` used to pick a single provider — web push if VAPID was
 * configured, the stub otherwise — and that shape has an assumption in it that
 * stopped being true: that one transport reaches everybody. Push is opt-in and
 * many people will never grant it; email reaches the ones who did not; and the
 * native shells will each want a provider of their own beside the web one
 * rather than instead of it. Choosing between them was never right, it was
 * just adequate while there was only one.
 *
 * Every notifier is offered every delivery. Filtering is the provider's job and
 * already is: webPushNotifier skips a row whose platform it cannot address, and
 * each one here filters by channel. A composite that tried to route centrally
 * would need to know what each provider can reach, which is the knowledge that
 * belongs inside them.
 *
 * Sequential rather than concurrent, deliberately. These fan out to devices and
 * to a mail API, and a burst of parallel sends to the same recipient set is a
 * way to hit a rate limit while making the log harder to read. Notifications
 * are not on a request path — this runs behind an action that already
 * succeeded.
 */
export function composeNotifiers(notifiers: readonly Notifier[]): Notifier {
  const live = notifiers.filter(Boolean);

  return {
    name: live.length === 0 ? "none" : live.map((n) => n.name).join("+"),

    async send(deliveries) {
      let sent = 0;
      let failed = 0;

      for (const notifier of live) {
        try {
          const result = await notifier.send(deliveries);
          sent += result.sent;
          failed += result.failed;
        } catch (cause) {
          /**
           * One provider throwing must not cost the others their turn.
           *
           * The whole reason to compose is that a member unreachable one way is
           * reachable another, and an exception from the first would otherwise
           * take the fallback down with it — turning a partial outage into a
           * total one for exactly the people this exists to reach.
           */
          failed += deliveries.length;
          console.error(
            JSON.stringify({
              at: "notify.compose",
              provider: notifier.name,
              problem: cause instanceof Error ? cause.message : "unknown",
            }),
          );
        }
      }

      return { sent, failed };
    },
  };
}
