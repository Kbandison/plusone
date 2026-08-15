#!/usr/bin/env node
/**
 * Behavioural checks for the config editor and metrics (§7.3).
 *
 * §7.3 says the config table is "hot-read by logic", and half of it was: the
 * SQL functions read it, the TypeScript used compiled-in defaults, and an
 * administrator changing the Drop weights changed nothing silently. The first
 * block here is what makes that claim testable.
 *
 * The middle block is the one worth keeping: §3.3 bans selling exemptions, and
 * the way that stays true is that there is no key to sell. An unknown key is
 * refused, so nobody can add `drop.per_premium_member` and wire it up later.
 *
 * Runs inside a transaction that is ROLLED BACK.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:config
 */

import pg from "pg";
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live config verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const problems = [];
const check = (ok, m) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${m}`); if (!ok) problems.push(m); };
let n = 0;
const member = async () => {
  n += 1;
  const { rows: [{ id }] } = await c.query(`select extensions.gen_random_uuid() id`);
  await c.query(`insert into auth.users (id,instance_id,aud,role,phone,created_at,updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555077${String(n).padStart(4,"0")}`]);
  await c.query(`update public.profiles set display_name='M', birthdate='1990-01-01' where id=$1`, [id]);
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
  const admin = await member();
  await c.query(`insert into public.admin_users (user_id) values ($1)`, [admin]);
  const plain = await member();

  console.log("\n── §7.3: the config is hot-read ──");
  const cfg = (await as(plain, `select public.tunable_config() c`)).rows[0].c;
  for (const key of ["drop.count", "drop.weights.intention", "connects.free_per_day", "radius.min_pool"]) {
    check(cfg[key] !== undefined, `${key} is readable by a member, so the Drop can use it`);
  }

  console.log("\n── editing ──");
  const before = cfg["drop.weights.intention"];
  await as(admin, `select public.admin_set_config('drop.weights.intention', to_jsonb(0.55::numeric))`);
  const after = (await as(plain, `select public.tunable_config() c`)).rows[0].c;
  check(Number(after["drop.weights.intention"]) === 0.55, `the value changed (${before} -> ${after["drop.weights.intention"]})`);

  const log = (await c.query(`select metadata from public.audit_log where action='config.set' order by id desc limit 1`)).rows[0];
  check(log?.metadata?.key === "drop.weights.intention", "the change is audited");
  // A config change you cannot read backwards is one nobody can undo at 3am.
  check(Number(log?.metadata?.from) === Number(before), `and records the previous value (${log?.metadata?.from})`);

  console.log("\n── what cannot be done ──");
  check(await refused(() => as(plain, `select public.admin_set_config('drop.count', to_jsonb(99))`)),
    "an ordinary member cannot change config");
  check(await refused(() => as(admin, `select public.admin_set_config('drop.per_premium_member', to_jsonb(9))`)),
    "an unknown key is refused, so a setting that does nothing cannot be invented");
  check(await refused(() => as(admin, `select public.admin_set_config('drop.count', '"lots"'::jsonb)`)),
    "a non-numeric value is refused");

  // §3.3's list is absent from the table, so it is absent from the editor.
  const keys = Object.keys(cfg);
  for (const forbidden of ["extend", "exempt", "bypass", "unlimited", "boost"]) {
    check(!keys.some((k) => k.includes(forbidden)), `no config key mentions "${forbidden}"`);
  }

  console.log("\n── metrics ──");
  const metrics = (await as(admin, `select public.admin_metrics() m`)).rows[0].m;
  check(typeof metrics.verified_members === "number", "an admin gets counts");
  check(metrics.closed_without_a_note === 0, `chats closed with no note: ${metrics.closed_without_a_note}`);
  const empty = (await as(plain, `select public.admin_metrics() m`)).rows[0].m;
  check(Object.keys(empty).length === 0, "an ordinary member gets nothing");
  // A dashboard is the easiest place to start looking at individuals.
  const blob = JSON.stringify(metrics);
  check(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(blob), "no member id appears in the metrics");
} finally { await c.query("rollback"); }
await c.end();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` : "\nConfig and metrics hold.\n");
process.exit(problems.length ? 1 : 0);
