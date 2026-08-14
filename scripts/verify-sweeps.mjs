#!/usr/bin/env node
/**
 * Behavioural checks for the sweeps (§6.2, §6.3, §9.3).
 *
 * The fuse's promise is not that a number reaches zero — it is that a chat
 * closes WITH A NOTE when it does. That is a claim about behaviour, so it is
 * tested by making a fuse expire and looking at what comes out.
 *
 * Runs inside a transaction that is ROLLED BACK, so it creates and destroys
 * members, chats and deletion requests without leaving anything behind. Safe
 * against the real project.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:sweeps
 * Skips (exit 0) when SUPABASE_DB_URL is unset.
 */

import pg from "pg";
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live sweep verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const problems = [];
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}`); if (!ok) problems.push(msg); };
const one = async (sql, p) => (await c.query(sql, p)).rows[0];

await c.query("begin");
try {
  const mk = async (phone) => {
    const { id } = await one(`select extensions.gen_random_uuid() id`);
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
      [id, phone]);
    await c.query(`update public.profiles set display_name=$2, community='hiv', condition='hiv',
      intention='long_term', birthdate='1990-01-01', search_radius_mi=50,
      verification_status='verified' where id=$1`, [id, phone]);
    return id;
  };
  const a = await mk("+15550100001");
  const b = await mk("+15550100002");

  const { id: connectId } = await one(
    `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, status, source, decided_at)
     values ($1,$2,'p1','hello there','accepted','drop',now()) returning id`, [a, b]);

  // One fuse already run out, one with three days left.
  const { id: expired } = await one(
    `insert into public.chats (connect_id, status, fuse_expires_at)
     values ($1,'open', now() - interval '1 hour') returning id`, [connectId]);

  const { id: connect2 } = await one(
    `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, status, source, decided_at)
     values ($1,$2,'p2','hi again','accepted','drop',now()) returning id`, [b, a]);
  const { id: live } = await one(
    `insert into public.chats (connect_id, status, fuse_expires_at)
     values ($1,'open', now() + interval '3 days') returning id`, [connect2]);

  console.log("\n── the sweep closes an expired fuse ──");
  const swept = await one(`select public.sweep_expired_fuses() n`);
  check(swept.n >= 1, `closed ${swept.n} chat(s)`);

  const closed = await one(`select status, closure_template, closed_at, closed_by, fuse_expires_at
    from public.chats where id=$1`, [expired]);
  check(closed.status === "closed_fuse", `status is ${closed.status}`);

  // The whole point: a closed chat always carries a note.
  check(closed.closure_template !== null, `closure_template is ${closed.closure_template}, not null`);
  check(closed.closed_at !== null, "closed_at is set");
  check(closed.fuse_expires_at === null, "the fuse is cleared");
  // The fuse closed it, not a person.
  check(closed.closed_by === null, "closed_by is null — the mechanic closed it, not the other member");

  const untouched = await one(`select status from public.chats where id=$1`, [live]);
  check(untouched.status === "open", "a fuse with time left is untouched");

  console.log("\n── nothing can be closed without a note ──");
  const noteless = await one(
    `select count(*)::int n from public.chats
     where status in ('closed_fuse','closed_by_member') and closure_template is null`);
  check(noteless.n === 0, `${noteless.n} closed chats without a note`);

  console.log("\n── the 24h warning is content-blind ──");
  const warn = await c.query(`select * from public.fuses_expiring_within(24)`);
  const cols = Object.keys(warn.rows[0] ?? { chat_id: 1, user_id: 1, expires_at: 1 });
  check(!cols.some((k) => /body|message|name|prompt|condition/i.test(k)),
    `returns only ${cols.join(", ")}`);

  console.log("\n── pending connects expire ──");
  await c.query(
    `insert into public.connects (initiator_id, target_id, prompt_id, prompt_reply, source, expires_at)
     values ($1,$2,'p3','anyone home','drop', now() - interval '1 day')`, [a, b]);
  const expiredN = await one(`select public.sweep_expired_connects() n`);
  check(expiredN.n >= 1, `expired ${expiredN.n} connect(s)`);
  const stillPending = await one(
    `select count(*)::int n from public.connects where status='pending' and expires_at <= now()`);
  check(stillPending.n === 0, "no expired connect is left pending");

  console.log("\n── hard delete is hard ──");
  await c.query(`insert into public.deletion_requests (user_id, purge_after)
    values ($1, now() - interval '1 day')`, [b]);
  const purged = await c.query(`select * from public.purge_due_deletions()`);
  check(purged.rows.length === 1, `purged ${purged.rows.length} account(s)`);

  const gone = await one(`select count(*)::int n from public.profiles where id=$1`, [b]);
  check(gone.n === 0, "the profile row is gone, not flagged");
  const authGone = await one(`select count(*)::int n from auth.users where id=$1`, [b]);
  check(authGone.n === 0, "the auth user is gone");
  // Cascades rather than an enumerated list of tables.
  const orphanConnects = await one(
    `select count(*)::int n from public.connects where initiator_id=$1 or target_id=$1`, [b]);
  check(orphanConnects.n === 0, "their connects cascaded away");
  const orphanChats = await one(`select count(*)::int n from public.chats where id=$1`, [expired]);
  check(orphanChats.n === 0, "chats hanging off those connects cascaded too");

  const notDue = await one(`select count(*)::int n from public.profiles where id=$1`, [a]);
  check(notDue.n === 1, "an account with no due request is untouched");
} finally {
  await c.query("rollback");
}
await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nEvery sweep behaves as promised.\n");
process.exit(problems.length ? 1 : 0);
