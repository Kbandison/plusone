#!/usr/bin/env node
/**
 * Verifies the APPLIED schema against a live database.
 *
 * `pnpm check:sql` parses the migrations and cross-checks their references, but
 * a parser cannot see what Postgres actually did with them. This checks the
 * properties that only exist once the SQL has run — and that are dangerous
 * precisely because nothing complains when they are wrong:
 *
 *   · a view without security_invoker runs as its OWNER, silently bypassing
 *     every policy underneath it. It returns rows. It just returns the wrong
 *     ones, to the wrong people.
 *   · a SECURITY DEFINER function without a pinned search_path can be steered
 *     into calling an attacker's function of the same name.
 *   · PostGIS lives in the `extensions` schema on Supabase, so every reference
 *     has to be qualified. Unqualified ones parse fine and fail at call time.
 *
 * Usage:  SUPABASE_DB_URL='postgresql://...' pnpm check:db
 *
 * Skips (exit 0) when SUPABASE_DB_URL is unset, so CI stays green without
 * handing a database credential to the runner.
 */

import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live schema verification.");
  process.exit(0);
}

// Expected counts. These are assertions about the migrations, so a drift here
// means either the schema changed or this file did not keep up.
const EXPECT = { tables: 24, views: 3, functions: 32, enums: 17, rooms: 5, config: 16 };
const INVOKER_VIEWS = ["visible_profiles", "preview_profiles", "visible_profile_photos"];
const NO_UPDATE_PATH = ["connects", "chats"];

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, params) => (await client.query(sql, params)).rows;

const problems = [];
const check = (ok, msg) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}`);
  if (!ok) problems.push(msg);
};

console.log("\n── inventory ──");
const counts = await q(`
  select
    (select count(*) from pg_tables where schemaname = 'public') tables,
    (select count(*) from pg_views  where schemaname = 'public') views,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public') functions,
    (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e') enums`);
for (const key of ["tables", "views", "functions", "enums"]) {
  const got = Number(counts[0][key]);
  check(got === EXPECT[key], `${EXPECT[key]} ${key} (got ${got})`);
}

console.log("\n── row level security ──");
const noRls = await q(`
  select tablename from pg_tables t where schemaname = 'public'
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity)`);
check(noRls.length === 0, `every table enables RLS${noRls.length ? ` — missing: ${noRls.map((r) => r.tablename).join(", ")}` : ""}`);

const noPolicy = await q(`
  select tablename from pg_tables t where schemaname = 'public'
    and not exists (
      select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)`);
check(noPolicy.length === 0, `every table has at least one policy${noPolicy.length ? ` — missing: ${noPolicy.map((r) => r.tablename).join(", ")}` : ""}`);

console.log("\n── views run as the caller, not the owner ──");
for (const view of INVOKER_VIEWS) {
  const [row] = await q(
    `select coalesce((select option_value from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'), 'off') si
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = $1`,
    [view],
  );
  check(row?.si === "true" || row?.si === "on", `${view}: security_invoker = ${row?.si ?? "MISSING VIEW"}`);
}

console.log("\n── SECURITY DEFINER functions pin search_path ──");
const definers = await q(`
  select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef order by p.proname`);
const unpinned = definers.filter((d) => !(d.proconfig ?? []).some((x) => x.startsWith("search_path=")));
check(
  unpinned.length === 0,
  `all ${definers.length} SECURITY DEFINER functions pin search_path${unpinned.length ? ` — unpinned: ${unpinned.map((d) => d.proname).join(", ")}` : ""}`,
);

// The fuse is only unpurchasable if there is no write path to reach it.
console.log("\n── no client write path to the fuse ──");
for (const table of NO_UPDATE_PATH) {
  const ups = await q(
    `select policyname from pg_policies where schemaname = 'public' and tablename = $1 and cmd = 'UPDATE'`,
    [table],
  );
  check(ups.length === 0, `${table}: no UPDATE policy${ups.length ? ` — found ${ups.map((u) => u.policyname).join(", ")}` : ""}`);
}

console.log("\n── PostGIS resolves at call time ──");
try {
  const [row] = await q(`
    select public.distance_mi(
      public.round_location(extensions.ST_MakePoint(-122.4194, 37.7749)::extensions.geography),
      public.round_location(extensions.ST_MakePoint(-118.2437, 34.0522)::extensions.geography)) d`);
  const d = Number(row.d);
  check(d > 300 && d < 400, `distance_mi(San Francisco, Los Angeles) = ${d} mi`);
} catch (error) {
  check(false, `PostGIS call failed: ${error.message}`);
}

console.log("\n── anon reaches no table directly ──");
const anonGrants = await q(`
  select table_name, privilege_type from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public' order by table_name, privilege_type`);
check(
  anonGrants.length === 0,
  `anon holds no table grants${anonGrants.length ? ` — found ${anonGrants.map((g) => `${g.table_name}/${g.privilege_type}`).join(", ")}` : ""}`,
);

console.log("\n── seed ──");
const [{ rooms }] = await q(`select count(*) rooms from public.rooms`);
const [{ cfg }] = await q(`select count(*) cfg from public.app_config`);
check(Number(rooms) === EXPECT.rooms, `${EXPECT.rooms} seed rooms (got ${rooms})`);
check(Number(cfg) === EXPECT.config, `${EXPECT.config} app_config rows (got ${cfg})`);

await client.end();

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) in the applied schema.\n`);
  process.exit(1);
}
console.log("\nApplied schema matches the migrations on every checked property.\n");
