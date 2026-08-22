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
 *   SUPABASE_DB_URL='postgresql://...' pnpm push:test <user-id> [event]
 */

import pg from "pg";
import webpush from "web-push";
import { readFileSync } from "node:fs";

// Imported through vitest's own resolver — see the npm script. The workspace
// packages use extensionless TypeScript imports, which node cannot resolve on
// its own, and building them just to send one notification would be a build
// step that exists for a test tool.
import { NOTIFICATIONS, PUSH_APP_NAME, EMAIL_SUBJECT } from "@plusone/config";
import { notify } from "@plusone/logic";

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

const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: sub } =
  process.env;
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

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(
  `select endpoint, p256dh, auth from public.push_subscriptions
    where user_id = $1 and platform = 'web'`,
  [userId],
);

if (rows.length === 0) {
  console.error("That member has no registered web device. Turn notifications on first.");
  await client.end();
  process.exit(1);
}

console.log(`sending to ${rows.length} device(s)…`);

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
    console.error(`  FAIL ${status}  ${new URL(row.endpoint).host}  ${cause?.body ?? cause?.message ?? ""}`);
    if (status === 404 || status === 410) {
      // Same rule the real transport uses: these two mean gone forever.
      await client.query(`select public.forget_push_device($1)`, [row.endpoint]);
      console.error("       endpoint was dead and has been forgotten");
    }
  }
}

await client.end();
