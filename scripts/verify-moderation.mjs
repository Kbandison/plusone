#!/usr/bin/env node
/**
 * Behavioural checks for the moderation queue (§7.3).
 *
 * Separate from check:admin, which covers verification decisions and the
 * condition reveal. Two scenarios in one script means two sets of bindings
 * fighting over the same names, and the merge is not worth what it buys.
 *
 * What this asserts, beyond the mechanics: a moderator sees the reported text
 * and the reporter's account, and NO condition data. Deciding whether a message
 * was abusive does not require knowing anybody's diagnosis.
 *
 * Runs inside a transaction that is ROLLED BACK.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:moderation
 */

import pg from "pg";
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live moderation verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const problems = [];
const check = (ok, m) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${m}`); if (!ok) problems.push(m); };
let n = 0;
const member = async (name) => {
  n += 1;
  const { rows: [{ id }] } = await c.query(`select extensions.gen_random_uuid() id`);
  await c.query(`insert into auth.users (id,instance_id,aud,role,phone,created_at,updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555055${String(n).padStart(4,"0")}`]);
  await c.query(`update public.profiles set display_name=$2, birthdate='1990-01-01', community='hiv',
    condition='hiv', u_equals_u=true, intention='long_term', search_radius_mi=50,
    verification_status='verified' where id=$1`, [id, name]);
  return id;
};
const as = async (id, sql, p) => {
  await c.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({sub:id,role:"authenticated"})]);
  return c.query(sql, p);
};
let sp = 0;
const refused = async (fn) => {
  const name = `sp${sp++}`; await c.query(`savepoint ${name}`);
  try { await fn(); await c.query(`release savepoint ${name}`); return false; }
  catch { await c.query(`rollback to savepoint ${name}`); return true; }
};

await c.query("begin");
try {
  const admin = await member("Mod");
  await c.query(`insert into public.admin_users (user_id) values ($1)`, [admin]);
  const reporter = await member("Reporter");
  const subject = await member("Subject");

  await as(reporter, `insert into public.reports (reporter_id, reported_user_id, reason, detail)
    values ($1,$2,'harassment',$3)`, [reporter, subject, "Kept messaging after I asked them to stop."]);

  console.log("\n── a moderator sees the report ──");
  const open = await as(admin, `select * from public.admin_open_reports()`);
  const mine = open.rows.filter((r) => r.reported_user_id === subject);
  check(mine.length === 1, `one open report (${mine.length})`);
  check(mine[0]?.reason === "harassment", `reason is ${mine[0]?.reason}`);
  check(mine[0]?.detail?.includes("asked them to stop"), "the reporter's account comes through");
  check(mine[0]?.reported_display_name === "Subject", "and who it is about");

  // §7.3 — condition data is never shown by default.
  console.log("\n── and no condition data ──");
  const cols = Object.keys(mine[0] ?? {});
  for (const forbidden of ["community", "condition", "u_equals_u"]) {
    check(!cols.includes(forbidden), `the queue does not return ${forbidden}`);
  }

  console.log("\n── deciding ──");
  const notAdmin = await refused(() =>
    as(reporter, `select public.admin_resolve_report($1,'resolved',null)`, [mine[0].queue_id]));
  check(notAdmin, "an ordinary member cannot resolve a report");

  const badStatus = await refused(() =>
    as(admin, `select public.admin_resolve_report($1,'open',null)`, [mine[0].queue_id]));
  check(badStatus, "a report is resolved or dismissed, not reopened");

  await as(admin, `select public.admin_resolve_report($1,'resolved','spoke to them')`, [mine[0].queue_id]);
  const after = await as(admin, `select * from public.admin_open_reports()`);
  check(after.rows.filter((r) => r.reported_user_id === subject).length === 0, "it leaves the open queue");

  const logged = await c.query(`select action, metadata from public.audit_log
    where action='report.decide' order by id desc limit 1`);
  check(logged.rows[0]?.metadata?.status === "resolved", "the decision is audited");
  check(logged.rows[0]?.metadata?.note === "spoke to them", "with the moderator's note");

  const twice = await refused(() =>
    as(admin, `select public.admin_resolve_report($1,'dismissed',null)`, [mine[0].queue_id]));
  check(twice, "and cannot be decided twice");

  console.log("\n── member lookup ──");
  const found = await as(admin, `select * from public.admin_member_lookup('Subj')`);
  check(found.rows.length >= 1, `finds a member by name (${found.rows.length})`);
  const lookupCols = Object.keys(found.rows[0] ?? {});
  for (const forbidden of ["community", "condition", "u_equals_u", "bio", "birthdate"]) {
    check(!lookupCols.includes(forbidden), `lookup does not return ${forbidden}`);
  }
  const tooShort = await as(admin, `select * from public.admin_member_lookup('a')`);
  check(tooShort.rows.length === 0, "a one-character query returns nothing, rather than everyone");
  const asMember = await as(reporter, `select * from public.admin_member_lookup('Subj')`);
  check(asMember.rows.length === 0, "an ordinary member gets no results at all");
} finally { await c.query("rollback"); }
await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nThe moderator paths hold.\n");
process.exit(problems.length ? 1 : 0);
