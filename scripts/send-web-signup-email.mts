#!/usr/bin/env node
/**
 * One email, once: iPhone invitees who never used their invitation are told
 * Plus One works in Safari. Kevin, 2026-10-06.
 *
 * Why these people: of 42 beta invitations sent on 2026-09-20, Android used 7
 * of 13 and iPhone 1 of 29. The TestFlight public link was live the whole time,
 * so the door was open — but install TestFlight, join, install the app, then
 * re-open the invitation is a lot to ask on a phone, and the web app needs none
 * of it. Every one of those invitations expired on 2026-10-04.
 *
 * What it deliberately does NOT say: anything about the beta or a thank-you.
 * No email ever announced one, so there is nothing to withdraw, and saying so
 * would manufacture a loss in the one email meant to bring somebody in.
 *
 * Run:
 *   NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/send-web-signup-email.mts
 *     prints the recipient count by metro and the email, sends nothing
 *   ... --send --confirm=<count>
 *     sends, only if <count> is exactly the number the dry run printed
 *
 * The react-server condition is what lets `server-only` modules load here.
 *
 * Kept in the repo as the record of what was sent and to whom, by rule rather
 * than by name. Re-running it is safe: ids already sent are read from the
 * ledger file and skipped.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import pg from "pg";

// .env.local fills what the shell has not set — but NOT these two. The local
// file is stale on both (it points at app.loveplusone.app, which was never
// attached, and has no sender), and a wrong origin here would put a dead "leave
// the list" link in front of every recipient. Production's values, pinned.
const PRODUCTION = {
  NEXT_PUBLIC_APP_URL: "https://www.loveplusone.app",
  RESEND_FROM: "Plus One <support@loveplusone.app>",
} as const;

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = line.slice(eq + 1).trim();
  }
} catch {
  // Not present; the shell must supply everything.
}
Object.assign(process.env, PRODUCTION);

// After the environment is settled: footer() reads the origin when called, and
// sendDirectEmail reads the sender and key.
const { sendDirectEmail } = await import("../apps/web/src/lib/email.ts");
const { footer } = await import("../apps/web/src/lib/waitlist.ts");

const SUBJECT = "Plus One works in Safari";
const BODY = [
  "Getting Plus One onto an iPhone took more steps than it should have. You can skip them.",
  "It works right in Safari: same app, same account. Sign up at www.loveplusone.app.",
  "Tip: tap Share, then Add to Home Screen, and it opens like any other app.",
];
const LINK = `${PRODUCTION.NEXT_PUBLIC_APP_URL}/onboarding/phone`;

const LEDGER = process.env["WEB_SIGNUP_LEDGER"] ?? "scripts/.web-signup-sent.json";

const args = process.argv.slice(2);
const send = args.includes("--send");
const confirm = Number(args.find((a) => a.startsWith("--confirm="))?.split("=")[1]);

const db = new pg.Client({
  connectionString: process.env["SUPABASE_DB_URL"],
  ssl: { rejectUnauthorized: false },
});
await db.connect();
/**
 * Nobody who already has an account. Kevin, 2026-10-06: an email asking
 * somebody to sign up for an account they hold is the wrong email.
 *
 * Matched here, in the query, and nowhere else — against both the waitlist
 * address and the Apple ID they gave for TestFlight. The match is used to
 * EXCLUDE and is then gone: nothing records which waitlist row belongs to which
 * account, and only a count is printed. That is the line WAITLIST_NEVER draws —
 * it bans STORING the binding, because a stored one turns "this address asked
 * about an HSV and HIV app" into a fact about a member.
 *
 * It can only see accounts with an email on them. Most members sign up by
 * phone, and the waitlist holds no phone by design, so a member who never
 * added an email is not matched and will still receive this.
 */
const { rows } = await db.query<{
  id: string;
  email: string;
  token: string;
  metro: string;
  has_account: boolean;
}>(
  `select w.id, w.email, w.token, w.metro,
          exists (
            select 1 from auth.users u
             where u.email is not null and u.email <> ''
               and lower(u.email) in (lower(w.email), lower(coalesce(w.store_account_email, '')))
          ) as has_account
     from public.waitlist w
    where w.invited_at is not null
      and w.accepted_at is null
      and w.store_platform = 'ios'
    order by w.metro, w.id`,
);
await db.end();

const members = rows.filter((row) => row.has_account).length;
const already = new Set<string>(existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : []);
const pending = rows.filter((row) => !row.has_account && !already.has(row.id));

const byMetro = new Map<string, number>();
for (const row of pending) byMetro.set(row.metro, (byMetro.get(row.metro) ?? 0) + 1);

const text = (token: string) => `${BODY.join("\n\n")}\n\n${LINK}${footer(token)}`;

console.log(`from     ${PRODUCTION.RESEND_FROM}`);
console.log(`subject  ${SUBJECT}`);
console.log(`\n${text("<their-token>")}`);
console.log(
  `\nrecipients: ${pending.length} of ${rows.length} (already members, skipped: ${members}; already sent: ${rows.length - members - pending.length})`,
);
console.log([...byMetro].map(([metro, n]) => `  ${metro} ${n}`).join("\n"));

if (!send) {
  console.log(`\nDry run. Nothing sent. To send: --send --confirm=${pending.length}`);
  process.exit(0);
}
if (confirm !== pending.length) {
  console.error(`\nRefused: --confirm=${confirm} does not match ${pending.length} recipients.`);
  process.exit(1);
}

let sent = 0;
let failed = 0;
for (const row of pending) {
  const ok = await sendDirectEmail({ to: row.email, subject: SUBJECT, text: text(row.token) });
  if (ok) {
    sent += 1;
    // Written after every success, so a run that dies halfway resumes rather
    // than repeating anybody.
    already.add(row.id);
    writeFileSync(LEDGER, JSON.stringify([...already], null, 1));
  } else {
    failed += 1;
  }
}
// Counts only — no addresses in a terminal that may be shared.
console.log(`\nsent ${sent}, failed ${failed}`);
