import { describe, expect, it, vi } from "vitest";

import { composeNotifiers } from "./compose";
import { buildPayload } from "./notify";
import type { NotificationDelivery, Notifier } from "./notify";

const delivery = (channel: "push" | "email" = "push"): NotificationDelivery => ({
  recipientId: "u1",
  channel,
  payload: buildPayload("drop_ready"),
});

const notifier = (
  name: string,
  result: { sent: number; failed: number } | Error,
  seen?: NotificationDelivery[][],
): Notifier => ({
  name,
  async send(deliveries) {
    seen?.push([...deliveries]);
    if (result instanceof Error) throw result;
    return result;
  },
});

describe("composeNotifiers", () => {
  it("names itself after what it actually holds", () => {
    expect(composeNotifiers([]).name).toBe("none");
    expect(composeNotifiers([notifier("web-push", { sent: 0, failed: 0 })]).name).toBe("web-push");
    expect(
      composeNotifiers([
        notifier("web-push", { sent: 0, failed: 0 }),
        notifier("resend", { sent: 0, failed: 0 }),
      ]).name,
    ).toBe("web-push+resend");
  });

  it("sums what every provider reports", async () => {
    const composed = composeNotifiers([
      notifier("a", { sent: 2, failed: 1 }),
      notifier("b", { sent: 3, failed: 0 }),
    ]);
    expect(await composed.send([delivery()])).toEqual({ sent: 5, failed: 1 });
  });

  it("offers every delivery to every provider", async () => {
    // Routing is the provider's job — each filters by channel, and web push
    // already skips a row whose platform it cannot address. A composite that
    // routed centrally would need to know what each one can reach.
    const seen: NotificationDelivery[][] = [];
    const both = [delivery("push"), delivery("email")];
    await composeNotifiers([
      notifier("a", { sent: 1, failed: 0 }, seen),
      notifier("b", { sent: 1, failed: 0 }, seen),
    ]).send(both);

    expect(seen).toHaveLength(2);
    expect(seen[0]?.map((d) => d.channel)).toEqual(["push", "email"]);
    expect(seen[1]?.map((d) => d.channel)).toEqual(["push", "email"]);
  });

  it("gives the others their turn when one throws", async () => {
    // The reason to compose at all is that somebody unreachable one way is
    // reachable another. A throw from the first taking the rest down would
    // turn a partial outage into a total one for exactly those people.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: NotificationDelivery[][] = [];

    const composed = composeNotifiers([
      notifier("broken", new Error("provider is down")),
      notifier("working", { sent: 4, failed: 0 }, seen),
    ]);
    const result = await composed.send([delivery(), delivery()]);

    expect(seen).toHaveLength(1);
    expect(result.sent).toBe(4);
    // The two the broken provider was given are counted against it.
    expect(result.failed).toBe(2);

    const logged = JSON.parse(String(error.mock.calls[0]?.[0]));
    expect(logged.at).toBe("notify.compose");
    expect(logged.provider).toBe("broken");
    // §9.6 — a log line about a notification is where a body would leak.
    expect(JSON.stringify(logged)).not.toMatch(/Drop is ready|recipient/i);
    error.mockRestore();
  });

  it("is a no-op rather than a crash when there is nothing to send with", async () => {
    expect(await composeNotifiers([]).send([delivery()])).toEqual({ sent: 0, failed: 0 });
  });
});
