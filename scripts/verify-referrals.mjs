#!/usr/bin/env node
/**
 * Behavioural checks for referrals (§6.5, Decision #25).
 *
 * The parts that live in SQL: a permanent code, one attribution per invitee
 * forever, and a conversion that fires when the invitee reaches `verified` —
 * not when they sign up. The reward amounts are `packages/logic/referrals`'
 * business and are tested there.
 *
 * Runs inside a transaction that is ROLLED BACK.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:referrals
 */

import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live referral verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const problems = [];
const check = (ok, m) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${m}`); if (!ok) problems.push(m); };
const one = async (sql, p) => (await c.query(sql, p)).rows[0];

let seq = 0;
async function member() {
  seq += 1;
  const { id } = await one(`select extensions.gen_random_uuid() id`);
  await c.query(`insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555040${String(seq).padStart(4, "0")}`]);
  await c.query(`update public.profiles set display_name='M', birthdate='1990-01-01',
    community='hiv', condition='hiv', intention='long_term', search_radius_mi=50 where id=$1`, [id]);
  return id;
}
const as = async (id, sql, params) => {
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: id, role: "authenticated" })]);
  return c.query(sql, params);
};

/**
 * Runs with no member behind the call, which is what cron looks like.
 *
 * The claim set by `as()` is transaction-local and persists, so without this a
 * later "cron" call still carries the last member's uid — and
 * assert_not_end_user correctly refuses it. That is the guard working; the
 * script had to stop lying about who was asking.
 */
const asCron = async (sql, params) => {
  await c.query(`select set_config('request.jwt.claims', '', true)`);
  return c.query(sql, params);
};

await c.query("begin");
try {
  const referrer = await member();
  const invitee = await member();

  console.log("\n── the code is permanent ──");
  const first = (await as(referrer, `select public.my_referral_code() code`)).rows[0].code;
  const again = (await as(referrer, `select public.my_referral_code() code`)).rows[0].code;
  check(/^[a-z0-9]{6,12}$/.test(first), `code matches the required shape (${first})`);
  check(first === again, "asking twice returns the same code");

  console.log("\n── attribution happens once, forever ──");
  const attributed = (await as(invitee, `select public.attribute_referral($1) ok`, [first])).rows[0].ok;
  check(attributed === true, "the invitee is attributed to the referrer");

  const other = await member();
  const secondCode = (await as(other, `select public.my_referral_code() code`)).rows[0].code;
  const reattributed = (await as(invitee, `select public.attribute_referral($1) ok`, [secondCode])).rows[0].ok;
  check(reattributed === false, "a member cannot shop their signup to a second referrer");

  const selfRef = (await as(referrer, `select public.attribute_referral($1) ok`, [first])).rows[0].ok;
  check(selfRef === false, "nobody refers themselves");

  const bogus = (await as(invitee, `select public.attribute_referral('zzzzzzzz') ok`)).rows[0].ok;
  check(bogus === false, "an unknown code fails quietly rather than erroring");

  console.log("\n── the conversion counts at verification, not signup ──");
  let conv = await one(`select verified_at from public.referral_conversions where invitee_id=$1`, [invitee]);
  check(conv.verified_at === null, "signing up alone converts nothing");

  await c.query(`update public.profiles set verification_status='verified' where id=$1`, [invitee]);
  conv = await one(`select verified_at from public.referral_conversions where invitee_id=$1`, [invitee]);
  check(conv.verified_at !== null, "reaching verified converts it");

  console.log("\n── the reward job sees it exactly once ──");
  let pending = await asCron(`select * from public.unrewarded_conversions()`);
  const mine = pending.rows.filter((r) => r.referrer_id === referrer);
  check(mine.length === 1, `one unrewarded conversion (${mine.length})`);
  check(Number(mine[0].referrer_conversion_count) === 1, "it is the referrer's first");

  // Each SIDE settles independently (20260817001000). The settled-check used to
  // have no user predicate, so the invitee's grant alone marked the conversion
  // done — and a failure between the two payouts forfeited the referrer's
  // reward forever, with nothing left to replay it from.
  await asCron(`select public.grant_referral_premium($1,$2,14,'referrer')`, [mine[0].conversion_id, referrer]);
  pending = await asCron(`select * from public.unrewarded_conversions()`);
  const halfPaid = pending.rows.filter((r) => r.referrer_id === referrer);
  check(halfPaid.length === 1, "paying one side leaves the conversion outstanding");
  check(halfPaid[0]?.referrer_paid === true && halfPaid[0]?.invitee_paid === false,
    "and says which side is still owed");

  await asCron(`select public.grant_referral_premium($1,$2,14,'invitee')`, [mine[0].conversion_id, invitee]);
  pending = await asCron(`select * from public.unrewarded_conversions()`);
  check(pending.rows.filter((r) => r.referrer_id === referrer).length === 0,
    "once BOTH sides are paid it is not offered again — the job is idempotent");

  // Replaying a payout must not stack a second grant on the same side.
  const before = await one(`select count(*)::int as n from public.premium_grants where source like $1`,
    [`referral:${mine[0].conversion_id}%`]);
  await asCron(`select public.grant_referral_premium($1,$2,14,'referrer')`, [mine[0].conversion_id, referrer]);
  const after = await one(`select count(*)::int as n from public.premium_grants where source like $1`,
    [`referral:${mine[0].conversion_id}%`]);
  check(before.n === after.n, "a replayed payout does not grant twice");

  console.log("\n── grants stack rather than overwrite ──");
  const grant = await one(`select expires_at from public.premium_grants where user_id=$1`, [referrer]);
  check(grant.expires_at > new Date(), `premium runs to ${grant.expires_at.toISOString().slice(0,10)}`);

  const conv2 = await one(`select extensions.gen_random_uuid() id`);
  await asCron(`select public.grant_referral_premium($1,$2,14)`, [conv2.id, referrer]);
  const stacked = await one(
    `select max(expires_at) e from public.premium_grants where user_id=$1`, [referrer]);
  check(stacked.e > grant.expires_at, "a second grant extends from the end of the first, not from now");

  console.log("\n── members cannot pay themselves ──");
  let refused = false;
  await c.query(`savepoint p`);
  try {
    await as(referrer, `select public.grant_referral_premium($1,$2,3650)`, [conv2.id, referrer]);
    await c.query(`release savepoint p`);
  } catch { refused = true; await c.query(`rollback to savepoint p`); }
  check(refused, "grant_referral_premium refuses a signed-in member");
} finally {
  await c.query("rollback");
}
await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nThe referral loop holds.\n");
process.exit(problems.length ? 1 : 0);
