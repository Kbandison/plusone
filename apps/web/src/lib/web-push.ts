import "server-only";

import webpush from "web-push";

import { PUSH_APP_NAME, parseServerEnv, parseClientEnv } from "@plusone/config";
import { notify } from "@plusone/logic";

import { serviceClient } from "./cron";

/**
 * The real notifier (§8), finally.
 *
 * `notify.Notifier` has been a seam with one implementation — a stub that logs
 * — since Milestone 1. Everything above it was already correct: the payload is
 * built from an event rather than a body, and re-checked against the banned
 * terms on the way out, so nothing reaching this file can carry a condition
 * word. This only has to deliver what it is handed.
 *
 * Which is also why this file must not enrich anything. There is no name here,
 * no message preview and no count, and any future change that adds one is
 * defeating the check upstream rather than extending it.
 */

/** Configured once per process rather than per send. */
let ready: boolean | null = null;

function configure(): boolean {
  if (ready !== null) return ready;

  const server = parseServerEnv(process.env);
  const client = parseClientEnv(process.env);
  const publicKey = client.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = server.VAPID_PRIVATE_KEY;
  const subject = server.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    // Absent is a legal state — push is the one channel that can be missing
    // without the app being broken. Said once, loudly, rather than per send.
    console.warn(
      JSON.stringify({
        at: "webpush.configure",
        problem: "VAPID keys are not set — push notifications are disabled",
      }),
    );
    ready = false;
    return ready;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  ready = true;
  return ready;
}

interface Device {
  readonly user_id: string;
  readonly endpoint: string;
  readonly p256dh: string | null;
  readonly auth: string | null;
  readonly platform: string;
}

/**
 * Sends web push, and forgets an address the push service says is gone.
 *
 * 404 and 410 are the two codes that mean "this endpoint will never work
 * again" — the member cleared their browser data, uninstalled, or revoked
 * permission. Anything else (a 429, a 500, a timeout) is this attempt failing
 * rather than the address being dead, and deleting on those would unsubscribe
 * people because a push service had a bad afternoon.
 */
export function webPushNotifier(): notify.Notifier {
  return {
    name: "web-push",
    async send(deliveries) {
      const push = deliveries.filter((d) => d.channel === "push");
      if (push.length === 0 || !configure()) {
        return { sent: 0, failed: push.length };
      }

      const supabase = serviceClient();
      const recipientIds = [...new Set(push.map((d) => d.recipientId))];

      const { data, error } = await supabase.rpc("push_devices_for", {
        p_user_ids: recipientIds,
      });

      if (error) {
        console.error(JSON.stringify({ at: "webpush.devices", problem: error.message }));
        return { sent: 0, failed: push.length };
      }

      // Grouped, because a member has as many devices as they have browsers and
      // every one of them is an address for the same delivery.
      const byUser = new Map<string, Device[]>();
      for (const device of (data ?? []) as Device[]) {
        if (device.platform !== "web") continue;
        const list = byUser.get(device.user_id) ?? [];
        list.push(device);
        byUser.set(device.user_id, list);
      }

      let sent = 0;
      let failed = 0;
      const dead: string[] = [];

      await Promise.all(
        push.flatMap((delivery) =>
          (byUser.get(delivery.recipientId) ?? []).map(async (device) => {
            if (!device.p256dh || !device.auth) {
              failed += 1;
              return;
            }

            try {
              await webpush.sendNotification(
                {
                  endpoint: device.endpoint,
                  keys: { p256dh: device.p256dh, auth: device.auth },
                },
                JSON.stringify({
                  // Exactly the checked payload, nothing added.
                  title: delivery.payload.title,
                  body: delivery.payload.body,
                  path: delivery.payload.path,
                  event: delivery.payload.event,
                }),
                // A drop is worth holding for a few hours if the phone is off;
                // it is still tonight's drop in the morning. Anything longer and
                // a member wakes to a notification about a Drop that has since
                // been replaced.
                { TTL: 60 * 60 * 8, urgency: "normal" },
              );
              sent += 1;
            } catch (cause) {
              failed += 1;
              const status = (cause as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) {
                dead.push(device.endpoint);
                return;
              }
              // §9.6 — the log carries the event and a status, never the
              // recipient's endpoint, which is a device identifier.
              console.error(
                JSON.stringify({
                  at: "webpush.send",
                  event: delivery.payload.event,
                  status: status ?? "unknown",
                }),
              );
            }
          }),
        ),
      );

      // Cleaned up here rather than left for a sweep. A dead endpoint retried
      // nightly is a nightly failure that looks like a delivery problem.
      await Promise.all(
        dead.map((endpoint) => supabase.rpc("forget_push_device", { p_endpoint: endpoint })),
      );

      return { sent, failed };
    },
  };
}

/** Named for the logs, so a stub delivery and a real one are told apart. */
export const PUSH_SENDER = PUSH_APP_NAME;
