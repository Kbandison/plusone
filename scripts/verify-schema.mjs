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
const EXPECT = { tables: 24, views: 3, functions: 54, enums: 17, rooms: 5, config: 16 };
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

// Onboarding builds a profile across screens, so community/condition/intention
// are nullable. The invariant moved rather than disappeared: a VERIFIED profile
// must be complete. Evaluated against the catalogue's own constraint text, so
// this tests Postgres rather than a retyping of it.
console.log("\n── a visible profile is a complete one ──");
const PROFILE_CHECKS = [
  "profiles_condition_matches_community",
  "profiles_ueu_hiv_only",
  "profiles_complete_when_onboarded",
  "profiles_adult",
  "profiles_radius_range",
];
const defs = Object.fromEntries(
  (
    await q(
      `select conname, pg_get_constraintdef(oid) def from pg_constraint
       where conrelid = 'public.profiles'::regclass and contype = 'c'
         and conname = any($1)`,
      [PROFILE_CHECKS],
    )
  ).map((r) => [r.conname, r.def.replace(/^CHECK\s*\(/, "").replace(/\)$/, "")]),
);
check(
  Object.keys(defs).length === PROFILE_CHECKS.length,
  `all ${PROFILE_CHECKS.length} profile constraints present`,
);

const CAST = {
  display_name: "text",
  birthdate: "date",
  search_radius_mi: "integer",
  community: "public.condition_community",
  condition: "public.condition_detail",
  intention: "public.intention",
  u_equals_u: "boolean",
  verification_status: "public.verification_status",
  onboarded_at: "timestamptz",
};
const EMPTY = {
  display_name: null, birthdate: null, community: null, condition: null,
  intention: null, search_radius_mi: null, u_equals_u: false,
  verification_status: "unverified", onboarded_at: null,
};
const FULL = {
  display_name: "Sam", birthdate: "1990-06-15", community: "hiv", condition: "hiv",
  intention: "long_term", search_radius_mi: 50, u_equals_u: true,
  verification_status: "verified", onboarded_at: "2026-08-14T00:00:00Z",
};
const CASES = [
  ["a bare row from the sign-up trigger is allowed", EMPTY, true],
  ["mismatched community and condition is rejected",
    { ...EMPTY, community: "hsv", condition: "hiv" }, false],
  ["U=U without the hiv community is rejected",
    { ...EMPTY, community: "hsv", condition: "hsv2", u_equals_u: true }, false],
  ["an under-18 birthdate is rejected",
    { ...EMPTY, display_name: "Sam", birthdate: "2020-01-01" }, false],
  // Liveness runs before basics, so a member can be verified with an empty
  // profile. That is correct and must stay allowed — an administrator upholding
  // an appeal for someone flagged at step 2 depends on it.
  ["verified but not yet onboarded is allowed", { ...EMPTY, verification_status: "verified" }, true],
  ["complete and onboarded is allowed", FULL, true],
  ["onboarded with no name is rejected", { ...FULL, display_name: null }, false],
  ["onboarded with no birthdate is rejected", { ...FULL, birthdate: null }, false],
  ["onboarded with no intention is rejected", { ...FULL, intention: null }, false],
  ["onboarded with no chosen radius is rejected", { ...FULL, search_radius_mi: null }, false],
  ["a radius outside 5..250 is rejected", { ...FULL, search_radius_mi: 400 }, false],
];
for (const [label, row, expected] of CASES) {
  const bindings = Object.entries(row)
    .map(([k, v]) => `${v === null ? "null" : `'${v}'`}::${CAST[k]} as ${k}`)
    .join(", ");
  const exprs = Object.entries(defs)
    .map(([name, def]) => `coalesce((${def}), true) as "${name}"`)
    .join(", ");
  const [r] = await q(`with candidate as (select ${bindings}) select ${exprs} from candidate`);
  const violated = Object.entries(r).filter(([, ok]) => ok === false).map(([n]) => n);
  const accepted = violated.length === 0;
  check(accepted === expected, `${label}${violated.length ? ` (by ${violated.join(", ")})` : ""}`);
}

// A public bucket is a permanent, unauthenticated link to a member's face, and
// no amount of RLS elsewhere takes that back. There is no public bucket in this
// product and there should never be one.
console.log("\n── no storage bucket is public ──");
const buckets = await q(`select id, public from storage.buckets order by id`);
check(buckets.length >= 2, `${buckets.length} bucket(s) defined`);
for (const bucket of buckets) {
  check(bucket.public === false, `${bucket.id} is private`);
}
for (const expected of ["photos", "verification-selfies"]) {
  check(buckets.some((b) => b.id === expected), `${expected} bucket exists`);
}

// Members write selfies and never read them back; the liveness path purges them
// at decision time, so a readable object would be a bug.
const selfieReads = await q(
  `select policyname from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
     and qual like '%verification-selfies%'`,
);
check(selfieReads.length === 0, "nothing grants read access to verification selfies");

console.log("\n── every auth user gets a profile row ──");
const [signupTrigger] = await q(
  `select tgname, tgrelid::regclass::text tbl, tgenabled from pg_trigger
   where tgname = 'create_profile_on_signup'`,
);
check(
  signupTrigger?.tbl === "auth.users" && signupTrigger.tgenabled !== "D",
  `create_profile_on_signup is on ${signupTrigger?.tbl ?? "NOTHING"} and enabled`,
);

// These act across every member's rows, so the service role is the only caller
// for which that is coherent. SECURITY DEFINER functions are executable by
// public by default, and that default is how a sweep becomes an anybody-button.
// Supabase's default privileges grant EXECUTE on every new public function to
// anon and authenticated, and `revoke ... from public` does not touch a named
// grant. That is how purge_due_deletions — which deletes accounts — was
// callable by any signed-in member. This is the check that would have caught it.
console.log("\n── sweeps are service-role only ──");
const SWEEPS = [
  "sweep_expired_fuses",
  "sweep_expired_connects",
  "purge_due_deletions",
  "fuses_expiring_within",
  "audit",
  "create_profile_for_new_user",
  "enforce_connect_rules",
  "assert_not_end_user",
  // The two-argument originals. Self-relative wrappers replaced them in every
  // policy; these stay only because definer functions call them internally.
  "is_premium",
  "profile_mode",
  "is_blocked_either_way",
  "has_accepted_connect",
  "is_member_of_room",
  "is_chat_participant",
  "can_view_profile",
];
for (const fn of SWEEPS) {
  const [row] = await q(
    `select p.proname,
            coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) auth_can,
            coalesce(has_function_privilege('anon', p.oid, 'EXECUTE'), false) anon_can,
            coalesce(has_function_privilege('service_role', p.oid, 'EXECUTE'), false) svc_can
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1`,
    [fn],
  );
  check(
    row !== undefined && !row.auth_can && !row.anon_can,
    `${fn}: out of reach (authenticated=${row?.auth_can}, anon=${row?.anon_can})`,
  );
}

// The other half of the same fix: these MUST stay executable. A policy
// expression runs as the querying role, so revoking them fails closed on
// everything rather than on the thing you meant.
const RLS_HELPERS = [
  "i_can_view",
  "i_am_in_room",
  "i_am_in_chat",
  "i_have_connected_with",
  "connect_permitted",
  "preview_permitted",
  "chat_accepts_messages",
  "viewer_community",
];
for (const fn of RLS_HELPERS) {
  const [row] = await q(
    `select coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) auth_can
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1 limit 1`,
    [fn],
  );
  check(row?.auth_can === true, `${fn} stays reachable, or every policy breaks`);
}

// §10's never-cut list. Each of these is a thing the product promises and
// could plausibly be dropped under time pressure without anyone noticing until
// launch. Asserting they exist is cheap; discovering at launch that voice notes
// have nowhere to live is not.
console.log("\n── the never-cut list has somewhere to live ──");
const NEVER_CUT = [
  ["voice notes", `select 1 from storage.buckets where id = 'voice-notes' and public = false`],
  ["hard delete", `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'purge_due_deletions'`],
  ["deletion requests", `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'request_deletion'`],
  ["the fuse sweep", `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'sweep_expired_fuses'`],
  ["consent records", `select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'consents'
                         and column_name = 'copy_version'`],
];
for (const [label, sql] of NEVER_CUT) {
  const rows = await q(sql);
  check(rows.length > 0, `${label}`);
}

// A closed chat accepts no further audio, or a member could keep talking into a
// conversation that had already closed kindly.
const voiceWrite = await q(
  `select policyname, with_check from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and with_check like '%voice-notes%'`,
);
check(
  voiceWrite.some((p) => p.with_check.includes("chat_accepts_messages")),
  "voice uploads are refused on a closed chat",
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
