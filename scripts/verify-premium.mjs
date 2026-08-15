#!/usr/bin/env node
/**
 * Behavioural checks for what premium does NOT buy (§3.3, Decision #24).
 *
 * "No selling exemptions from mechanics — fuse extensions, wall bypasses, extra
 * drops, undo. Never monetized. Ever."
 *
 * The unit tests assert the pure functions ignore premium. This asserts the
 * DATABASE does: a paying member and a free member, side by side, against the
 * real walls. If premium ever starts buying an exemption it will be through a
 * policy or an RPC, not through packages/logic — so this is where it would show
 * up.
 *
 * Runs inside a transaction that is ROLLED BACK.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:premium
 */

import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live premium verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const problems = [];
const check = (ok, m) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${m}`); if (!ok) problems.push(m); };

let n = 0;
async function member(over = {}) {
  n += 1;
  const { rows: [{ id }] } = await c.query(`select extensions.gen_random_uuid() id`);
  await c.query(
    `insert into auth.users (id,instance_id,aud,role,phone,created_at,updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555066${String(n).padStart(4, "0")}`],
  );
  const fields = {
    display_name: "M", birthdate: "1990-01-01", community: "hiv", condition: "hiv",
    intention: "long_term", search_radius_mi: 250, verification_status: "verified",
    mode: "dating", ...over,
  };
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`).join(", ");
  await c.query(`update public.profiles set ${sets} where id = $1`, [id, ...Object.values(fields)]);
  await c.query(
    `update public.profiles set location = public.round_location(
       extensions.ST_MakePoint(-122.4, 37.77)::extensions.geography) where id = $1`, [id]);
  return id;
}

const as = async (id, sql, p) => {
  await c.query(`select set_config('request.jwt.claims',$1,true)`,
    [JSON.stringify({ sub: id, role: "authenticated" })]);
  await c.query(`set local role authenticated`);
  try { return await c.query(sql, p); } finally { await c.query(`reset role`); }
};

let sp = 0;
const attempt = async (fn) => {
  const name = `sp${sp++}`;
  await c.query(`savepoint ${name}`);
  try { await fn(); await c.query(`release savepoint ${name}`); return true; }
  catch { await c.query(`rollback to savepoint ${name}`); return false; }
};

await c.query("begin");
try {
  const free = await member();
  const paid = await member();
  const shielded = await member({ mode: "support_only" });
  const otherCommunity = await member({ community: "hsv", condition: "hsv2" });

  // A real, active subscription — the thing that makes is_premium() true.
  await c.query(
    `insert into public.subscriptions (user_id, stripe_customer_id, stripe_sub_id, plan, status, current_period_end)
     values ($1, 'cus_test_premium', 'sub_test_premium', 'premium_3mo', 'active', now() + interval '90 days')`,
    [paid],
  );

  console.log("\n── the subscription is real ──");
  check((await c.query(`select public.is_premium($1) p`, [paid])).rows[0].p === true, "the paying member is premium");
  check((await c.query(`select public.is_premium($1) p`, [free])).rows[0].p === false, "the free member is not");

  console.log("\n── premium does not bypass the support-only wall ──");
  const paidSeesShielded = await as(paid, `select id from public.visible_profiles where id=$1`, [shielded]);
  check(paidSeesShielded.rows.length === 0, "a paying member still cannot see a support-only member");
  const paidConnects = await attempt(() => as(paid,
    `insert into public.connects (initiator_id,target_id,prompt_id,prompt_reply,source)
     values ($1,$2,'sunday','hello there','drop')`, [paid, shielded]));
  check(!paidConnects, "and still cannot connect to one");

  console.log("\n── premium does not bypass the community wall ──");
  const paidSeesOther = await as(paid, `select id from public.visible_profiles where id=$1`, [otherCommunity]);
  check(paidSeesOther.rows.length === 0, "a paying member still cannot see the other community");

  console.log("\n── premium does not bypass a block ──");
  await c.query(`insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [free, paid]);
  const paidSeesBlocker = await as(paid, `select id from public.visible_profiles where id=$1`, [free]);
  check(paidSeesBlocker.rows.length === 0, "a paying member still cannot see someone who blocked them");
  await c.query(`delete from public.blocks where blocker_id=$1`, [free]);

  console.log("\n── premium does not touch the fuse ──");
  const target = await member();
  const { rows: [conn] } = await c.query(
    `insert into public.connects (initiator_id,target_id,prompt_id,prompt_reply,source,status,decided_at)
     values ($1,$2,'sunday','hello there','drop','accepted',now()) returning id`, [paid, target]);
  const { rows: [chat] } = await c.query(
    `insert into public.chats (connect_id, status, fuse_expires_at)
     values ($1,'open', now() + interval '7 days') returning id, fuse_expires_at`, [conn.id]);

  // There is no UPDATE policy on chats at all — for anyone, at any price.
  const paidExtends = await attempt(() => as(paid,
    `update public.chats set fuse_expires_at = now() + interval '90 days' where id=$1`, [chat.id]));
  check(!paidExtends, "a paying member cannot extend their own fuse");

  const updatePolicies = await c.query(
    `select count(*)::int n from pg_policies where tablename in ('chats','connects') and cmd='UPDATE'`);
  check(updatePolicies.rows[0].n === 0, "there is no update policy on chats or connects to exempt anyone with");

  console.log("\n── premium does not enlarge the Drop ──");
  const dropCount = await c.query(`select value from public.app_config where key='drop.count'`);
  check(String(dropCount.rows[0]?.value) === "3", `drop.count is a single global value (${dropCount.rows[0]?.value})`);
  const perMember = await c.query(
    `select count(*)::int n from information_schema.columns
     where table_schema='public' and table_name='drops' and column_name ilike '%count%'`);
  check(perMember.rows[0].n === 0, "and drops has no per-member count column to raise");

  console.log("\n── premium raises the connect budget, and only that ──");
  const free_per = await c.query(`select value from public.app_config where key='connects.free_per_day'`);
  const prem_per = await c.query(`select value from public.app_config where key='connects.premium_per_day'`);
  check(Number(prem_per.rows[0]?.value) > Number(free_per.rows[0]?.value), 
    `premium sends more per day (${free_per.rows[0]?.value} -> ${prem_per.rows[0]?.value})`);
  check(Number(prem_per.rows[0]?.value) < 100, "and it is still a cap, not unlimited");

  console.log("\n── our database never learns who is paying ──");
  const cols = await c.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='subscriptions'`);
  const names = cols.rows.map((r) => r.column_name);
  for (const forbidden of ["name", "email", "address", "card", "last4", "postal"]) {
    check(!names.some((col) => col.includes(forbidden)), `subscriptions has no ${forbidden} column`);
  }
} finally {
  await c.query("rollback");
}

await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nPremium buys nothing it should not.\n");
process.exit(problems.length ? 1 : 0);
