#!/usr/bin/env node
/**
 * Sends one real notification to one member, for testing the whole chain.
 *
 * An operator script rather than an app route, deliberately. Something that can
 * push to an arbitrary member is exactly what should not exist behind a URL —
 * not even an admin-gated one, because a bug in the gate is then a bug that
 * reaches somebody's lock screen. This reads the service credentials from the
 * environment and runs on a laptop.
 *
 * It goes through buildPayload like everything else, so what arrives is what
 * the app would really send: the content-blind check runs, and a payload that
 * failed it would throw here rather than being delivered.
 *
 * Usage:
 *   pnpm push:test <user-id> [event]
 *
 * Reads its credentials from .env.local, which already holds every one it
 * needs. It used to want a SUPABASE_DB_URL as well — see the client below.
 */

import webpush from "web-push";
import { readFileSync } from "node:fs";

// Imported through vitest's own resolver — see the npm script. The workspace
// packages use extensionless TypeScript imports, which node cannot resolve on
// its own, and building them just to send one notification would be a build
// step that exists for a test tool.
import { NOTIFICATIONS, PUSH_APP_NAME, EMAIL_SUBJECT } from "@plusone/config";
import { notify } from "@plusone/logic";
import { createServiceSupabase } from "@plusone/db";

// The same wire the app sends through, not a second copy. See the note below.
import { apnsConfig, sendApnsAlerts } from "../apps/web/src/lib/apns-transport.ts";

// .env.local is where the VAPID pair lives in development. Vercel supplies them
// as real environment variables in a deployment, so this only fills the gaps.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = line.slice(eq + 1).trim();
  }
} catch {
  // Not present in CI or on a deployment, which is fine.
}

const [userId, event = "drop_ready"] = process.argv.slice(2);
if (!userId) {
  console.error("Usage: node scripts/send-test-push.mjs <user-id> [event]");
  process.exit(1);
}
if (!(event in NOTIFICATIONS)) {
  console.error(`Unknown event "${event}". One of: ${Object.keys(NOTIFICATIONS).join(", ")}`);
  process.exit(1);
}

const {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: pub,
  VAPID_PRIVATE_KEY: priv,
  VAPID_SUBJECT: sub,
} = process.env;
if (!pub || !priv || !sub) {
  console.error("VAPID keys are not set — nothing to send with.");
  process.exit(1);
}
webpush.setVapidDetails(sub, pub, priv);

// The real thing, checked on the way out. A body carrying a condition word
// throws rather than being sent.
const payload = notify.buildPayload(event);
console.log(`payload: ${JSON.stringify(payload)}`);
if (payload.title !== PUSH_APP_NAME || payload.emailSubject !== EMAIL_SUBJECT) {
  console.error("payload did not come from the shared builder — refusing to send");
  process.exit(1);
}

/**
 * The same client, and the same RPC, that the real transport uses.
 *
 * This opened a Postgres socket and wrote its own SQL, which cost two things.
 * SUPABASE_DB_URL is the only credential the project would otherwise never
 * need — nothing else here talks to Postgres directly — so the script could not
 * run without a secret fetched specially for it. And reading
 * push_subscriptions by hand made this a SECOND implementation of a lookup
 * webPushNotifier does through push_devices_for: the test could have passed
 * while the thing it stands in for was broken, which is the one outcome a test
 * like this must not have.
 *
 * Both now go through the same security-definer function with the key that is
 * already in .env.local.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set — it should be in .env.local.`);
    process.exit(1);
  }
  return value;
}

const supabase = createServiceSupabase(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SECRET_KEY"),
);

interface Device {
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  platform: string;
}

const { data, error } = await supabase.rpc("push_devices_for", { p_user_ids: [userId] });
if (error) {
  console.error(`could not read that member's devices: ${error.message}`);
  process.exit(1);
}

// Split by transport, exactly as the real notifiers do it: the RPC returns
// every device a member has, and each transport addresses only its own.
const devices = (data ?? []) as Device[];
const rows = devices.filter((device) => device.platform === "web" && device.p256dh && device.auth);
const native = devices.filter((device) => device.platform === "ios");

if (rows.length === 0 && native.length === 0) {
  console.error("That member has no registered device. Turn notifications on first.");
  process.exit(1);
}

console.log(`sending to ${rows.length} web and ${native.length} iOS device(s)…`);

/**
 * The iOS half, which this script could not do until 2026-08-26.
 *
 * It filtered to `platform === "web"` and skipped an `ios` row in silence — so
 * the one tool for proving the chain end to end could not exercise the
 * transport that had just been built, and the only way to see a real
 * notification arrive was to wait for the 8pm Drop.
 *
 * It imports the same wire the app uses rather than a second copy of it. That
 * needed apns.ts splitting: it opens with `import "server-only"`, which throws
 * outside a React Server Component, so nothing under scripts/ could touch it.
 * The wire moved to apns-transport.ts, which carries no such import.
 */
if (native.length > 0) {
  const config = apnsConfig();
  if (!config) {
    console.error("  APNs is not configured — all four APNS_ values or none. Skipping iOS.");
  } else {
    const results = await sendApnsAlerts(
      config,
      native.map((device) => ({
        deviceToken: device.endpoint,
        alert: {
          title: payload.title,
          body: payload.body,
          event: payload.event,
          path: payload.path,
          sound: payload.event === "drop_ready",
        },
      })),
    );

    for (const { deviceToken, status } of results) {
      // Never the token itself, which is a device identifier (§9.6). The last
      // six characters are enough to tell two devices apart in a console.
      const tail = deviceToken.slice(-6);
      if (status === 200) {
        console.log(`  ok  200  apns …${tail}`);
        continue;
      }
      console.error(`  FAIL ${status}  apns …${tail}`);
      if (status === 400) {
        console.error(
          "       400 is almost always BadDeviceToken: the token was minted against the",
        );
        console.error(
          "       other APNs host. A build run from Xcode is sandbox; TestFlight and the",
        );
        console.error("       App Store are production. Check APNS_ENVIRONMENT.");
      }
      if (status === 403) {
        console.error("       403 is InvalidProviderToken — the .p8, the key id, or the team id.");
      }
      if (status === 410 || status === 400) {
        await supabase.rpc("forget_push_device", { p_endpoint: deviceToken });
        console.error("       token was dead and has been forgotten");
      }
    }
  }
}

for (const row of rows) {
  try {
    const result = await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        path: payload.path,
        event: payload.event,
      }),
      { TTL: 60 * 60 * 8, urgency: "normal" },
    );
    console.log(`  ok  ${result.statusCode}  ${new URL(row.endpoint).host}`);
  } catch (cause) {
    const status = cause?.statusCode ?? "?";
    console.error(
      `  FAIL ${status}  ${new URL(row.endpoint).host}  ${cause?.body ?? cause?.message ?? ""}`,
    );
    if (status === 404 || status === 410) {
      // Same rule the real transport uses: these two mean gone forever.
      await supabase.rpc("forget_push_device", { p_endpoint: row.endpoint });
      console.error("       endpoint was dead and has been forgotten");
    }
  }
}
