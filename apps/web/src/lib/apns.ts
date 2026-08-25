import "server-only";

import { sign } from "node:crypto";
import { connect, constants } from "node:http2";

import { notify } from "@plusone/logic";

import { serviceClient } from "./cron";

/** What `push_devices_for` returns. `endpoint` carries the device token here. */
interface Device {
  readonly user_id: string;
  readonly endpoint: string;
  readonly platform: string;
}

/**
 * Apple rejects a provider token older than an hour and rate-limits how often
 * you may mint one. Forty-five minutes leaves room for a slow batch without
 * ever presenting a stale token.
 */
const TOKEN_TTL_MS = 45 * 60 * 1000;

/** Module-level, so a warm instance reuses the token across invocations. */
let cached: { token: string; mintedAt: number } | null = null;

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url").replace(/=+$/, "");

interface ApnsConfig {
  readonly keyId: string;
  readonly teamId: string;
  readonly bundleId: string;
  readonly privateKey: string;
  readonly host: string;
}

/**
 * The configuration, or nothing.
 *
 * All four values or none — a partial set cannot send and would fail per
 * message rather than at the seam. `notifier()` uses the same shape to decide
 * whether to build this at all, so reaching here without it means the
 * environment changed under a running process.
 *
 * The key is the .p8 file's contents, newlines and all. Vercel's environment
 * editor keeps them; a shell `export` usually does not, which is why
 * `\n` is accepted and rewritten.
 */
function configure(): ApnsConfig | null {
  const keyId = process.env["APNS_KEY_ID"];
  const teamId = process.env["APNS_TEAM_ID"];
  const bundleId = process.env["APNS_BUNDLE_ID"];
  const privateKey = process.env["APNS_PRIVATE_KEY"];
  if (!keyId || !teamId || !bundleId || !privateKey) return null;

  return {
    keyId,
    teamId,
    bundleId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    // Sandbox is a different host, not a flag. A token minted by a development
    // build is meaningless to production and answers 400 BadDeviceToken, which
    // is the single most common way this looks broken when it is not.
    host:
      process.env["APNS_ENVIRONMENT"] === "sandbox"
        ? "https://api.sandbox.push.apple.com"
        : "https://api.push.apple.com",
  };
}

/**
 * The provider token: an ES256 JWT, signed with the .p8 key.
 *
 * Hand-rolled rather than pulled from a library because it is three fields and
 * a signature, and the one thing worth getting right is the encoding. JOSE
 * wants the raw `r || s` pair, 64 bytes for P-256; Node's default for an EC key
 * is DER, which Apple rejects with a 403 that says only "InvalidProviderToken".
 * `dsaEncoding: "ieee-p1363"` is the whole fix.
 */
export function providerToken(config: ApnsConfig, now: number = Date.now()): string {
  if (cached && now - cached.mintedAt < TOKEN_TTL_MS) return cached.token;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign(null, Buffer.from(`${header}.${claims}`), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });

  const token = `${header}.${claims}.${base64url(signature)}`;
  cached = { token, mintedAt: now };
  return token;
}

/** Only for tests, which must not inherit a token minted by another case. */
export function resetProviderToken(): void {
  cached = null;
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

      const config = configure();
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

      const byUser = new Map<string, Device[]>();
      for (const device of (data ?? []) as Device[]) {
        if (device.platform !== "ios") continue;
        const list = byUser.get(device.user_id) ?? [];
        list.push(device);
        byUser.set(device.user_id, list);
      }
      if (byUser.size === 0) return { sent: 0, failed: 0 };

      const token = providerToken(config);
      const session = connect(config.host);
      const dead: string[] = [];
      let sent = 0;
      let failed = 0;

      try {
        await Promise.all(
          wanted.flatMap((delivery) =>
            (byUser.get(delivery.recipientId) ?? []).map(async (device) => {
              notify.assertContentBlind(delivery.payload);

              const body = JSON.stringify({
                aps: {
                  alert: { title: delivery.payload.title, body: delivery.payload.body },
                  // The Drop is the one event a member opted into a moment for.
                  // Everything else arrives quietly, exactly as in sw.js.
                  ...(delivery.payload.event === "drop_ready" ? { sound: "default" } : {}),
                },
                // Read by the shell when the notification is tapped. Same
                // content-blind path the web payload carries.
                path: delivery.payload.path,
              });

              const status = await new Promise<number>((resolve) => {
                const request = session.request({
                  [constants.HTTP2_HEADER_METHOD]: "POST",
                  [constants.HTTP2_HEADER_PATH]: `/3/device/${device.endpoint}`,
                  authorization: `bearer ${token}`,
                  "apns-topic": config.bundleId,
                  "apns-push-type": "alert",
                  "apns-priority": "10",
                  "apns-collapse-id": delivery.payload.event,
                });
                request.setEncoding("utf8");
                request.on("response", (headers) =>
                  resolve(Number(headers[constants.HTTP2_HEADER_STATUS]) || 0),
                );
                request.on("error", () => resolve(0));
                request.end(body);
              });

              if (status === 200) {
                sent += 1;
                return;
              }
              failed += 1;
              // The same rule the web transport uses: two codes mean gone
              // forever and everything else means this attempt failed. 410 is
              // Unregistered; a 400 here is almost always BadDeviceToken, which
              // is a token from the other environment and equally undeliverable.
              if (status === 410 || status === 400) dead.push(device.endpoint);
              // §9.6 — a status, never the token, which is a device identifier.
              console.error(JSON.stringify({ at: "apns.send", status }));
            }),
          ),
        );
      } finally {
        session.close();
      }

      for (const endpoint of dead) {
        await supabase.rpc("forget_push_device", { p_endpoint: endpoint });
      }

      return { sent, failed };
    },
  };
}
