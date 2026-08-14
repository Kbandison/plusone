#!/usr/bin/env node
/**
 * Behavioural checks against a live database, for the admin paths.
 *
 * The other two checkers read structure — what exists, how it is defined.
 * These exercise it: they create a throwaway member and a throwaway
 * administrator, act as each in turn, and assert what actually happens. That is
 * the only way to test a SECURITY DEFINER function's own authorisation, because
 * nothing about its definition tells you whether the check inside it works.
 *
 * Everything runs inside a transaction that is ROLLED BACK, so it never leaves
 * a row behind, and it is safe against the real project.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:admin
 * Skips (exit 0) when SUPABASE_DB_URL is unset.
 */

import pg from "pg";
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live admin verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const problems = [];
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}`); if (!ok) problems.push(msg); };

// A throwaway member and a throwaway admin, inside a transaction that is rolled
// back — nothing here survives, so this never touches real data.
await c.query("begin");
try {
  const uid = (await c.query(`select extensions.gen_random_uuid() id`)).rows[0].id;
  const admin = (await c.query(`select extensions.gen_random_uuid() id`)).rows[0].id;
  // profiles.id references auth.users, so create the users first.
  for (const [id, phone] of [[uid, "+15550000001"], [admin, "+15550000002"]]) {
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
      [id, phone],
    );
  }
  await c.query(`update public.profiles set display_name='Subject', community='hiv', condition='hiv', u_equals_u=true where id=$1`, [uid]);
  await c.query(`insert into public.admin_users (user_id) values ($1)`, [admin]);

  const asAdmin = async (sql, params) => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: admin, role: "authenticated" })]);
    return c.query(sql, params);
  };
  // An exception aborts the surrounding transaction, so every call that is
  // expected to fail runs inside its own savepoint.
  let sp = 0;
  const expectThrow = async (fn) => {
    const name = `sp${sp++}`;
    await c.query(`savepoint ${name}`);
    try { await fn(); await c.query(`release savepoint ${name}`); return false; }
    catch { await c.query(`rollback to savepoint ${name}`); return true; }
  };

  const asMember = async (sql, params) => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: "authenticated" })]);
    return c.query(sql, params);
  };

  console.log("\n── the reveal cannot happen without a logged reason ──");
  const before = (await c.query(`select count(*)::int n from public.audit_log where action='condition.reveal'`)).rows[0].n;

  for (const [label, reason] of [["null", null], ["empty", "   "], ["too short", "checking"]]) {
    const threw = await expectThrow(() =>
      asAdmin(`select * from public.admin_reveal_condition($1, $2)`, [uid, reason]));
    check(threw, `a ${label} reason is refused`);
  }

  const after = (await c.query(`select count(*)::int n from public.audit_log where action='condition.reveal'`)).rows[0].n;
  check(after === before, "a refused reveal writes no audit entry");

  const good = await asAdmin(`select * from public.admin_reveal_condition($1, $2)`,
    [uid, "reviewing report #4182 for a policy breach"]);
  check(good.rows[0]?.condition === "hiv", `a valid reveal returns the data (${good.rows[0]?.condition})`);

  const logged = await c.query(
    `select actor_id, metadata->>'reason' reason from public.audit_log
     where action='condition.reveal' and subject_id=$1 order by id desc limit 1`, [uid]);
  check(logged.rows[0]?.actor_id === admin, "the audit entry names the administrator who asked");
  check(logged.rows[0]?.reason === "reviewing report #4182 for a policy breach",
    "the audit entry records the reason verbatim");
  const total = (await c.query(`select count(*)::int n from public.audit_log where action='condition.reveal'`)).rows[0].n;
  check(total === before + 1, "exactly one entry per successful reveal");

  console.log("\n── and not by a non-administrator ──");
  const denied = await expectThrow(() =>
    asMember(`select * from public.admin_reveal_condition($1, $2)`, [uid, "just having a look at this"]));
  check(denied, "an ordinary member is refused");
  const afterMember = (await c.query(`select count(*)::int n from public.audit_log where action='condition.reveal'`)).rows[0].n;
  check(afterMember === total, "a refused non-admin reveal writes nothing");

  console.log("\n── decisions ──");
  const notUnderReview = await expectThrow(() =>
    asAdmin(`select public.admin_decide_verification($1, true, null)`, [uid]));
  check(notUnderReview, "a member who is not under review cannot be verified");

  await c.query(`update public.profiles set verification_status='flagged' where id=$1`, [uid]);
  const decided = await asAdmin(`select public.admin_decide_verification($1, true, 'looks like a real person') s`, [uid]);
  check(decided.rows[0].s === "verified", "a flagged member can be verified");

  await c.query(`update public.profiles set verification_status='rejected' where id=$1`, [uid]);
  const reversed = await asAdmin(`select public.admin_decide_verification($1, true, 'appeal upheld') s`, [uid]);
  check(reversed.rows[0].s === "verified", "a rejected member can still be verified — the appeal path never closes");

  console.log("\n── the queue shows no condition data ──");
  await c.query(`update public.profiles set verification_status='flagged' where id=$1`, [uid]);
  const queue = await asAdmin(`select * from public.admin_flagged_verifications()`);
  const cols = Object.keys(queue.rows[0] ?? {});
  check(cols.length > 0, `queue returns ${queue.rows.length} row(s)`);
  for (const forbidden of ["community", "condition", "u_equals_u"]) {
    check(!cols.includes(forbidden), `queue does not return ${forbidden}`);
  }
} finally {
  await c.query("rollback");
}
await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nAll admin guarantees hold.\n");
process.exit(problems.length ? 1 : 0);
