#!/usr/bin/env node
/**
 * Behavioural checks for the column grants (§5.3, §9).
 *
 * Row-level security is row-level. Every policy in this schema scopes rows
 * correctly, and a table-wide `grant select, insert, update` then handed every
 * member all 26 columns of every row their policy let them reach — so a member
 * could set their own verification_status to 'verified' and skip liveness
 * entirely, and could read an exact date of birth and home coordinate for
 * everyone in their pool.
 *
 * check:sql would never catch that: the grant is valid SQL and the policies are
 * all correct. Only acting as a member and trying it finds it, which is why
 * this runs the exploits rather than reading the ACL.
 *
 * Runs inside a transaction that is ROLLED BACK. Safe against the real project.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:columns
 */

import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live column verification.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin");

const problems = [];
const check = (ok, msg, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}${detail ? `  — ${detail}` : ""}`);
  if (!ok) problems.push(msg);
};

let sp = 0;
/** Each attempt in its own savepoint, so a refusal does not abort the run. */
async function attempt(id, sql, params) {
  const name = `s${(sp += 1)}`;
  await c.query(`savepoint ${name}`);
  let err = null;
  let res = null;
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: id, role: "authenticated" }),
    ]);
    await c.query(`set local role authenticated`);
    res = await c.query(sql, params);
  } catch (e) {
    err = e;
  }
  // Rolling back to the savepoint clears both the aborted state and the role,
  // and keeps the ORIGINAL error rather than the cascade that follows it.
  await c.query(`rollback to savepoint ${name}`);
  return { ok: !err, err, res };
}

let seq = 0;
async function member(over = {}) {
  const { rows: [{ id }] } = await c.query(`select extensions.gen_random_uuid() id`);
  seq += 1;
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`,
    [id, `+1555096${String(seq).padStart(4, "0")}`],
  );
  const fields = {
    display_name: "Member", birthdate: "1990-01-01", community: "hiv", condition: "hiv",
    intention: "long_term", search_radius_mi: 250, verification_status: "verified",
    mode: "dating", cross_community_opt_in: false, ...over,
  };
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`).join(", ");
  await c.query(`update public.profiles set ${sets} where id = $1`, [id, ...Object.values(fields)]);
  await c.query(
    `update public.profiles set location = extensions.ST_MakePoint(-122.4, 37.77)::extensions.geography where id = $1`,
    [id],
  );
  return id;
}

const viewer = await member();
const other = await member({ display_name: "Other", birthdate: "1993-06-15" });

// ── the writes a member must not be able to make ─────────────────────────────
console.log("\nColumns a member must not write:");
for (const [label, sql] of [
  ["verification_status — liveness is the wall", `update public.profiles set verification_status='verified' where id=$1`],
  ["verified_at", `update public.profiles set verified_at=now() where id=$1`],
  ["liveness_passed_at", `update public.profiles set liveness_passed_at=now() where id=$1`],
  ["mode — switch_mode owns the re-entry cooldown", `update public.profiles set mode='support_only' where id=$1`],
  ["mode_dating_reentry_at", `update public.profiles set mode_dating_reentry_at=null where id=$1`],
  ["intention — change_intention owns its cooldown", `update public.profiles set intention='casual' where id=$1`],
  ["intention_changed_at", `update public.profiles set intention_changed_at=null where id=$1`],
  ["last_active_at — a Drop weight", `update public.profiles set last_active_at=now() where id=$1`],
]) {
  const r = await attempt(viewer, sql, [viewer]);
  check(!r.ok, label, r.ok ? "WROTE IT" : "permission denied");
}

// ── the reads a member must not be able to make ──────────────────────────────
console.log("\nColumns a member must not read:");
for (const [label, sql] of [
  ["birthdate — the views band it into an age", `select birthdate from public.profiles where id=$1`],
  ["location — tables.sql says it is NEVER exposed", `select location from public.profiles where id=$1`],
]) {
  const r = await attempt(viewer, sql, [other]);
  check(!r.ok, label, r.ok ? "READ IT" : "permission denied");
}
{
  const r = await attempt(viewer, `select updated_by from public.app_config limit 1`, []);
  check(!r.ok, "app_config.updated_by — it is the moderator roster", r.ok ? "READ IT" : "permission denied");
}

// ── and everything that must still work ──────────────────────────────────────
console.log("\nWhat must still work:");
{
  const r = await attempt(viewer, `update public.profiles set bio='hello', prompts='[]'::jsonb where id=$1`, [viewer]);
  check(r.ok, "a member can edit their own bio and prompts", r.ok ? "" : r.err.message.slice(0, 60));
}

// Every write onboarding makes, in the order the member makes them.
//
// The gate above tested that the columns a member SHOULD write are writable and
// stopped there, so it passed while the very first screen of onboarding was
// failing: the basics step used an upsert, which compiles to ON CONFLICT DO
// UPDATE over every column it is given — including `id`, which is deliberately
// not updatable. Testing the columns is not the same as testing the statements.
for (const [label, sql] of [
  ["basics — name and birthdate", `update public.profiles set display_name='K', birthdate='1991-05-28' where id=$1`],
  ["community and condition", `update public.profiles set community='hiv', condition='hiv', u_equals_u=true where id=$1`],
  ["photo privacy", `update public.profiles set photo_privacy='blurred_until_connected' where id=$1`],
  ["radius, and finishing", `update public.profiles set search_radius_mi=75, onboarded_at=now() where id=$1`],
  ["timezone", `update public.profiles set timezone='America/New_York' where id=$1`],
]) {
  const r = await attempt(viewer, sql, [viewer]);
  check(r.ok, `onboarding can write: ${label}`, r.ok ? "" : r.err.message.slice(0, 60));
}

// And the shape that actually broke, so it cannot come back.
{
  const r = await attempt(
    viewer,
    `insert into public.profiles (id, display_name, birthdate) values ($1,'K','1991-05-28')
     on conflict (id) do update set id = excluded.id, display_name = excluded.display_name`,
    [viewer],
  );
  check(!r.ok, "an upsert that rewrites `id` is still refused", r.ok ? "IT WROTE ITS OWN KEY" : "permission denied");
}
{
  const r = await attempt(viewer, `select key, value from public.app_config limit 1`, []);
  check(r.ok, "members still hot-read the tunables", r.ok ? "" : r.err.message.slice(0, 60));
}
{
  const r = await attempt(viewer, `select * from public.my_profile()`, []);
  const row = r.ok ? r.res.rows[0] : null;
  check(r.ok && r.res.rows.length === 1, "my_profile() returns exactly one row", r.ok ? `${r.res.rows.length} rows` : r.err.message.slice(0, 50));
  check(Boolean(row?.birthdate), "my_profile() is the way back to your own birthdate");
  check(row?.id === viewer, "my_profile() returns the CALLER's row and not another");
}
{
  const r = await attempt(viewer, `select id, display_name, age, age_band, distance_mi from public.visible_profiles where id=$1`, [other]);
  check(r.ok && r.res.rows.length === 1, "visible_profiles still serves a verified viewer", r.ok ? "" : r.err.message.slice(0, 60));
  const row = r.ok ? r.res.rows[0] : null;
  // The point of the definer flip: the view computes these from columns the
  // caller cannot read. If age is null the view is broken in the quiet way.
  check(row?.age != null && row?.age_band != null, "the view still computes age from a column the member cannot read",
    row ? `age ${row.age}, band ${row.age_band}` : "");
  check(row?.distance_mi != null, "the view still computes distance from a column the member cannot read",
    row ? `${row.distance_mi} mi` : "");
}
{
  const r = await attempt(viewer, `select * from public.visible_profiles limit 1`, []);
  const cols = r.ok ? Object.keys(r.res.rows[0] ?? {}) : [];
  check(!cols.includes("birthdate") && !cols.includes("location"),
    "visible_profiles exposes no raw birthdate or location", cols.length ? `${cols.length} columns` : "no rows");
}

// ── the photo path forgery ───────────────────────────────────────────────────
console.log("\nPhoto paths:");
{
  const r = await attempt(viewer,
    `insert into public.profile_photos (user_id, storage_path, blurred_path, position) values ($1,$2,$3,0)`,
    [viewer, `${other}/stolen.webp`, `${other}/stolen-blurred.webp`]);
  // The clear path is the blurred path minus "-blurred", so this forgery needs
  // no secret — only the blurred path, which is public to anyone who can see
  // the profile. The row must refuse a path the member does not own.
  check(!r.ok, "a photo row cannot point at another member's file", r.ok ? "FORGED" : "check constraint");
}
{
  const r = await attempt(viewer,
    `insert into public.profile_photos (user_id, storage_path, blurred_path, position) values ($1,$2,$3,1)`,
    [viewer, `${viewer}/mine.webp`, `${viewer}/mine-blurred.webp`]);
  check(r.ok, "a member can still add their own photo", r.ok ? "" : r.err.message.slice(0, 60));
}

// ── the functions that survived only on the default PUBLIC grant ─────────────
console.log("\nAnonymous reachability:");
for (const fn of ["public.tunable_config()", "public.viewer_community()", "public.config_int('drop.count', 3)"]) {
  const name = `s${(sp += 1)}`;
  await c.query(`savepoint ${name}`);
  let ok = false;
  try {
    await c.query(`select set_config('request.jwt.claims', '', true)`);
    await c.query(`set local role anon`);
    await c.query(`select ${fn}`);
    ok = true;
  } catch { /* refused, which is the point */ }
  await c.query(`rollback to savepoint ${name}`);
  check(!ok, `anon cannot call ${fn.split("(")[0]}`, ok ? "REACHABLE" : "permission denied");
}

await c.query("rollback");
await c.end();

console.log(
  problems.length
    ? `\n${problems.length} problem(s):\n${problems.map((p) => `  · ${p}`).join("\n")}`
    : "\nEvery column wall holds, and everything behind them still works.",
);
process.exit(problems.length ? 1 : 0);
