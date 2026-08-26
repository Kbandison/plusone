import "server-only";

import { notify } from "@plusone/logic";

import {
  apnsConfig,
  providerToken,
  resetProviderToken,
  sendApnsAlerts,
  type ApnsAlert,
} from "./apns-transport";
import { serviceClient } from "./cron";

/**
 * Re-exported so the tests and any existing import keep working. The wire
 * itself now lives in apns-transport.ts, which carries no `server-only` and can
 * therefore be used by `pnpm push:test` — see the note at the top of that file.
 */
export { providerToken, resetProviderToken };

/** What `push_devices_for` returns. `endpoint` carries the device token here. */
interface Device {
  readonly user_id: string;
  readonly endpoint: string;
  readonly platform: string;
}

/**
 * Push to an iPhone in the Capacitor shell.
 *
 * Beside `webPushNotifier` rather than instead of it — `composeNotifiers` runs
 * both, and a member with a browser and a shell has a row for each. This one
 * takes the `'ios'` rows and ignores everything else, which is the same
 * filtering web push already does in the other direction.
 *
 * ── why this is not a fetch ──────────────────────────────────────────────────
 *
 * APNs speaks HTTP/2 and refuses 1.1, and Node's `fetch` is undici, which is
 * 1.1 only. So `node:http2` directly. That is the entire reason this file looks
 * heavier than email.ts, which is a single POST.
 *
 * One session per batch, closed at the end. A long-lived session is the right
 * shape for a server that stays up and the wrong one for an invocation that
 * does not; this runs behind a cron or an action that is about to exit.
 *
 * ── content-blindness ───────────────────────────────────────────────────────
 *
 * The payload arrives checked and is checked again on the way out, for the
 * reason the stub notifier gives: a provider is the last thing to touch one.
 * Nothing is added here — no name, no preview, no count. `apns-collapse-id`
 * carries the event so four messages become one line, which is the same job the
 * service worker's `tag` does and the same reason the event name is safe to use
 * for it: it names a kind of thing, never a person.
 */
export function apnsNotifier(): notify.Notifier {
  return {
    name: "apns",

    async send(deliveries) {
      const wanted = deliveries.filter((d) => d.channel === "push");
      if (wanted.length === 0) return { sent: 0, failed: 0 };

      const config = apnsConfig();
      if (!config) return { sent: 0, failed: wanted.length };

      const supabase = serviceClient();
      const recipientIds = [...new Set(wanted.map((d) => d.recipientId))];

      const { data, error } = await supabase.rpc("push_devices_for", {
        p_user_ids: recipientIds,
      });
      if (error) {
        console.error(JSON.stringify({ at: "apns.devices", problem: error.message }));
        return { sent: 0, failed: wanted.length };
      }

      // Only the iOS rows. A member with a browser and a shell has one of each,
      // and web push takes the others in the same way, from the other side.
      const byUser = new Map<string, string[]>();
      for (const device of (data ?? []) as Device[]) {
        if (device.platform !== "ios") continue;
        byUser.set(device.user_id, [...(byUser.get(device.user_id) ?? []), device.endpoint]);
      }

      const targets: { deviceToken: string; alert: ApnsAlert }[] = [];
      for (const delivery of wanted) {
        // Checked again on the way out, for the reason the stub notifier gives:
        // a provider is the last thing to touch a payload.
        notify.assertContentBlind(delivery.payload);
        for (const deviceToken of byUser.get(delivery.recipientId) ?? []) {
          targets.push({
            deviceToken,
            alert: {
              title: delivery.payload.title,
              body: delivery.payload.body,
              event: delivery.payload.event,
              path: delivery.payload.path,
              sound: delivery.payload.event === "drop_ready",
            },
          });
        }
      }

      const results = await sendApnsAlerts(config, targets);

      let sent = 0;
      let failed = 0;
      const dead: string[] = [];
      for (const { deviceToken, status } of results) {
        if (status === 200) {
          sent += 1;
          continue;
        }
        failed += 1;
        // Two codes mean gone forever and everything else means this attempt
        // failed. 410 is Unregistered; a 400 here is almost always
        // BadDeviceToken, which is a token from the other environment and
        // equally undeliverable.
        if (status === 410 || status === 400) dead.push(deviceToken);
        // §9.6 — a status, never the token, which is a device identifier.
        console.error(JSON.stringify({ at: "apns.send", status }));
      }

      for (const endpoint of dead) {
        await supabase.rpc("forget_push_device", { p_endpoint: endpoint });
      }

      return { sent, failed };
    },
  };
}
