import type { NotificationDelivery, Notifier } from "./notify";
import { assertContentBlind } from "./notify";

/**
 * A notifier for development, before Resend's key exists.
 *
 * It re-checks every payload before "sending". The check in `buildPayload`
 * already ran, and running it again here is the point: a provider is the last
 * thing to touch a payload, so it is the last place a leak can be caught.
 * A real provider should do the same.
 *
 * Refuses to run in production, like the other stubs. A notifier that silently
 * discards is worse than no notifier, because nothing looks broken.
 */
export interface StubNotifierOptions {
  readonly sink?: (delivery: NotificationDelivery) => void;
  readonly allowInProduction?: boolean;
}

export function createStubNotifier(options: StubNotifierOptions = {}): Notifier {
  const { sink, allowInProduction = false } = options;

  if (!allowInProduction && process.env["NODE_ENV"] === "production") {
    throw new Error(
      "The stub notifier does not send anything and must never run in production. " +
        "Set a real notifier once RESEND_API_KEY exists.",
    );
  }

  return {
    name: "stub",
    // `async` so a refusal is a rejected promise rather than a synchronous
    // throw. A Promise-returning method that sometimes throws before returning
    // forces every caller to write both a try/catch and a .catch, and the one
    // they forget is the one that fires.
    async send(deliveries) {
      for (const delivery of deliveries) {
        assertContentBlind(delivery.payload);
        sink?.(delivery);
      }
      return { sent: deliveries.length, failed: 0 };
    },
  };
}
