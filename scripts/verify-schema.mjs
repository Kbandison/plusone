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

import { declaredEverywhere, finalState } from "./declared-objects.mjs";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.log("SUPABASE_DB_URL not set — skipping live schema verification.");
  process.exit(0);
}

// Expected counts, which catch an object that exists and should not.
//
// They do NOT catch the opposite, and it took a live defect to notice: these
// are hand-maintained numbers describing the DATABASE, so a migration that was
// never applied makes the real count smaller, somebody lowers the number to
// match, and the gate stays green forever. 20260824000200 sat in the repo
// unapplied for two days exactly that way, with emails_for() missing and the
// email notifier failing every delivery in production.
//
// The `declared vs applied` section below is the half that catches it, and it
// is derived from the migration files rather than written down here.
//
// rooms is 7, not the 5 §5.2 names: Latest news is a room now (20260820000300)
// and there are two of it, one per community, because rooms are scoped by
// community and news is too. The five the spec names are still all there.
// Updated 2026-08-29, after ALL FOUR of that day's migrations were applied.
// Every delta is attributable, which is the only reason to move these numbers
// at all — a silent bump to green buries the thing they exist to notice:
//   tables 32 -> 33, functions 119 -> 120   20260829001000, activity_alerts and
//                                           claim_activity_alerts (server 18c).
//   enums 21 -> 27                          20260829000100, the six new profile
//                                           enums — relationship_structure,
//                                           diet_kind, pets_kind,
//                                           education_level, work_field,
//                                           language_tag.
//   functions 120 -> 123                    20260829000400, server 18a: incognito
//                                           adds sees_incognito() and
//                                           set_incognito(), and the view rebuild
//                                           recreates drop_candidates. macOS's
//                                           18b function is counted in their own
//                                           move of this line.
//   enums 27 -> 29                          20260829000200, religion_kind and
//                                           politics_kind. 20260829000300 added
//                                           weight_kg, which is a column on an
//                                           existing type and moves nothing here.
//
// Read against the live database rather than by adding up the migrations: two
// sessions applied four migrations to one schema on the same afternoon, and the
// only account of it that cannot be stale is the one the database gives.
// functions 120 -> 121: 20260829002000, enforce_photo_privacy_is_premium (server 18b).
// functions 121 -> 123: 20260829000400, sees_incognito and set_incognito (server 18a).
//                       drop_candidates is recreated by that view rebuild, not added.
//
// Both sessions applied to one schema within minutes here, so 123 is read off
// the live database rather than reached by adding the two deltas — which is
// also how the collision on this line was noticed rather than averaged.
// tables 33 -> 34                          20260831000100, server 21: `waitlist`.
//                                           One table, no functions, no views and
//                                           no enums — and no POLICIES either,
//                                           which is why check:sql still passes
//                                           on it. That rule is conditional on
//                                           the table being granted to a role,
//                                           and this one is granted to nobody by
//                                           design. Read off the live database
//                                           after applying, not inferred.
// tables 34 -> 35, functions 123 -> 125, enums 29 -> 31
//                                          20260831000300, server 24: `feedback`,
//                                          submit_feedback and
//                                          admin_set_feedback_status, plus
//                                          feedback_kind and feedback_status.
//                                          Read off the live database after
//                                          applying, not added up.
const EXPECT = { tables: 35, views: 5, functions: 125, enums: 31, rooms: 7, config: 23 };

// Tables that deliberately hold no policy AND no grant to anon or
// authenticated. Reachable only by the service client, from a server path that
// owns the whole request.
//
// `waitlist` is the only one: there is no member behind a waitlist row, so
// "their own rows" has no meaning, and a definer RPC callable by anon would
// hand the confirmation token back to whoever called it. The migration header
// has the full argument.
const CLOSED_TABLES = ["waitlist"];
// 32/118 since 20260826000100: iap_entitlements, its binding trigger, and
// emails_for() from 20260824000200, which had been sitting unapplied.
//
// 33/120/27 on 2026-08-29. The six enums are 20260829000100's — relationship
// structure, diet, pets, education, work and language. The table and the
// function were NOT: both were already live and this line had not been moved
// with them, so two of the three failures this file reported that day predated
// the migration it was run for.
//
// Worth knowing before the next person reads a red inventory as a fresh
// mistake: `declared vs applied` below is the section that catches something
// genuinely missing, and it was green throughout. These counts are a second,
// weaker check that only notices drift when somebody remembers to move them.
const INVOKER_VIEWS = [];
const DEFINER_VIEWS = ["visible_profile_photos", "visible_profiles", "preview_profiles"];
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

console.log("\n── declared vs applied ──");
// Every object the migrations leave behind, net of drops, against what is
// actually there. This is the check that answers "has every migration been
// applied", which a count cannot: a name is missing or it is not.
const declared = declaredEverywhere();
const liveNames = {
  tables: new Set(
    (await q(`select tablename from pg_tables where schemaname = 'public'`)).map(
      (r) => r.tablename,
    ),
  ),
  views: new Set(
    (await q(`select viewname from pg_views where schemaname = 'public'`)).map((r) => r.viewname),
  ),
  functions: new Set(
    (
      await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public'`)
    ).map((r) => r.proname),
  ),
};
for (const kind of ["tables", "views", "functions"]) {
  const missing = [...declared[kind]].filter(([name]) => !liveNames[kind].has(name));
  check(
    missing.length === 0,
    missing.length === 0
      ? `every declared ${kind.replace(/s$/, "")} exists (${declared[kind].size})`
      : `${missing.length} declared ${kind} absent — ` +
          missing.map(([name, file]) => `${name} (apply ${file})`).join(", "),
  );
}

console.log("\n── row level security ──");
const noRls = await q(`
  select tablename from pg_tables t where schemaname = 'public'
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity)`);
check(
  noRls.length === 0,
  `every table enables RLS${noRls.length ? ` — missing: ${noRls.map((r) => r.tablename).join(", ")}` : ""}`,
);

// A table with no policy is deny-all. Whether that is a BUG or the point
// depends entirely on whether anything was granted to it — which this check
// did not ask, and check:sql's version of the same rule always has:
// "every table granted to a role has at least one policy (a granted table with
// no policy is silently deny-all)".
//
// The failure worth catching is a table somebody meant to open: grants written,
// policies forgotten, and PostgREST returning an empty set forever with no
// error anywhere. A table granted to NOBODY is a different object — closed on
// purpose, and `waitlist` (20260831000100) is the first one here.
//
// So the rule is split rather than relaxed, and the pair is strictly stronger
// than the single check was. The second half is the one that matters: it
// refuses a table that has no policy AND has grants appearing later, which is
// exactly how a deliberately-closed table becomes an accidentally-open one.
const noPolicy = await q(`
  select t.tablename,
         coalesce((
           select string_agg(distinct g.grantee, ',' order by g.grantee)
           from information_schema.role_table_grants g
           where g.table_schema = 'public'
             and g.table_name = t.tablename
             and g.grantee in ('anon', 'authenticated')
         ), '') as granted
    from pg_tables t
   where t.schemaname = 'public'
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename)`);

const grantedNoPolicy = noPolicy.filter((r) => r.granted !== "");
check(
  grantedNoPolicy.length === 0,
  `every table granted to a role has at least one policy${
    grantedNoPolicy.length
      ? ` — silently deny-all: ${grantedNoPolicy.map((r) => `${r.tablename} (${r.granted})`).join(", ")}`
      : ""
  }`,
);

// The exemption, asserted rather than assumed. Naming them means a NEW closed
// table shows up in this line rather than passing in silence — a table nobody
// can reach is a decision, and a decision nobody can see is how it gets undone.
const closed = noPolicy.filter((r) => r.granted === "").map((r) => r.tablename);
check(
  closed.every((name) => CLOSED_TABLES.includes(name)),
  `tables closed to anon and authenticated by design: ${closed.join(", ") || "none"}${
    closed.every((name) => CLOSED_TABLES.includes(name))
      ? ""
      : ` — unexpected: ${closed.filter((n) => !CLOSED_TABLES.includes(n)).join(", ")}`
  }`,
);

// Two of the three views are projections over data the caller could already
// read, so they run as the caller and the policies underneath still apply.
//
// All three run as their owner now, and each earns it.
//
// visible_profile_photos: profile_photos is own-rows-only, so an invoker view
// over it returns nothing but your own photos — which is how
// blurred-until-connected sat decorative until 20260815000400.
//
// visible_profiles and preview_profiles: both compute age from birthdate and
// distance from location, and 20260815000800 took those two columns out of the
// members' grant because a table-wide grant was handing every member an exact
// date of birth and a home coordinate for everyone in their pool. An invoker
// view cannot read a column its caller cannot read, so the views that exist to
// band and bucket those values had to become the ones allowed to see them.
//
// The exception is only safe while each view does its own authorisation, which
// is asserted below rather than trusted — a definer view with a weak WHERE is
// strictly worse than the grant it replaced.
console.log("\n── views run as the caller, not the owner ──");
for (const view of INVOKER_VIEWS) {
  const [row] = await q(
    `select coalesce((select option_value from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'), 'off') si
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = $1`,
    [view],
  );
  check(
    row?.si === "true" || row?.si === "on",
    `${view}: security_invoker = ${row?.si ?? "MISSING VIEW"}`,
  );
}

for (const view of DEFINER_VIEWS) {
  const [row] = await q(
    `select coalesce((select option_value from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'), 'off') si,
       pg_get_viewdef(c.oid, true) def
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = $1`,
    [view],
  );
  check(row?.si === "false" || row?.si === "off", `${view}: runs as owner, deliberately`);
  // A definer view must also be a barrier, or a caller-supplied qual can be
  // evaluated ahead of the view's own WHERE and ask it leading questions.
  const [bar] = await q(
    `select coalesce((select option_value from pg_options_to_table(c.reloptions)
        where option_name = 'security_barrier'), 'off') sb
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = $1`,
    [view],
  );
  check(bar?.sb === "true" || bar?.sb === "on", `${view}: security_barrier is on`);
  // The whole justification for that exception. preview_profiles gates on
  // preview_permitted instead, which is the same idea under a different name.
  const def = String(row?.def ?? "");
  check(
    def.includes("i_can_view") || def.includes("preview_permitted"),
    `${view}: does its own authorisation rather than relying on RLS`,
  );
  // A definer view that forgets this returns every row in the table.
  check(def.toLowerCase().includes("where"), `${view}: has a WHERE clause at all`);
  // And the photo view must never hand back both variants.
  if (view === "visible_profile_photos") {
    check(
      !/blurred_path.*storage_path|storage_path.*blurred_path/s.test(def.split("FROM")[0] ?? "") ||
        def.includes("CASE"),
      `${view}: returns one resolved path, not both`,
    );
  }
  // Neither profile view may hand back the raw columns it was made definer for.
  //
  // Asserted against the view's actual output columns, not its text: both views
  // legitimately mention birthdate INSIDE age_from_birthdate(), and matching
  // the definition would fail on the correct thing. What matters is what comes
  // out — an age, a band, a bucketed distance, and never the raw value.
  if (view !== "visible_profile_photos") {
    const outputs = (
      await q(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = $1`,
        [view],
      )
    ).map((r) => r.column_name);
    const raw = outputs.filter((col) => col === "birthdate" || col === "location");
    check(raw.length === 0, `${view}: exposes no raw birthdate or location`, raw.join(", "));
  }
}

console.log("\n── SECURITY DEFINER functions pin search_path ──");
const definers = await q(`
  select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef order by p.proname`);
const unpinned = definers.filter(
  (d) => !(d.proconfig ?? []).some((x) => x.startsWith("search_path=")),
);
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
  check(
    ups.length === 0,
    `${table}: no UPDATE policy${ups.length ? ` — found ${ups.map((u) => u.policyname).join(", ")}` : ""}`,
  );
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

// Columns, constraints, policies and indexes, which the pass above cannot see.
// 20260826000300 adds one column and one constraint and creates no object at
// all, so without this the gate reports a clean schema while that migration
// sits unapplied — the same false reassurance that hid emails_for() for two
// days, one level down.
const declaredExtras = finalState();
const liveExtras = {
  constraints: new Set((await q(`select conname from pg_constraint`)).map((r) => r.conname)),
  policies: new Set(
    (await q(`select tablename, policyname from pg_policies where schemaname = 'public'`)).map(
      (r) => `${r.tablename}.${r.policyname}`,
    ),
  ),
  indexes: new Set(
    (await q(`select indexname from pg_indexes where schemaname = 'public'`)).map(
      (r) => r.indexname,
    ),
  ),
  columns: new Set(
    (
      await q(
        `select table_name, column_name from information_schema.columns where table_schema = 'public'`,
      )
    ).map((r) => `${r.table_name}.${r.column_name}`),
  ),
};
// `.slice(0, -1)` gives "policie" and "indexe". A gate people read has to
// read properly, or they start skimming it.
const SINGULAR = {
  constraints: "constraint",
  policies: "policy",
  indexes: "index",
  columns: "column",
};
for (const kind of ["constraints", "policies", "indexes", "columns"]) {
  const absent = [...declaredExtras[kind]].filter(([key]) => !liveExtras[kind].has(key));
  check(
    absent.length === 0,
    absent.length === 0
      ? `every declared ${SINGULAR[kind]} exists (${declaredExtras[kind].size})`
      : `${absent.length} declared ${kind} absent — ` +
          absent.map(([key, owner]) => `${key} (apply ${owner.file})`).join(", "),
  );
}

console.log("\n── the grants a new table arrives with ──");
// Supabase ships `alter default privileges ... grant all on tables to anon,
// authenticated`, so every new table arrives with the full set and has to
// revoke for itself. 20260813000700's opening revoke covered what existed then
// and nothing since.
//
// This checked anon only, and so under-reported the one time it fired:
// iap_entitlements had granted the same seven privileges to AUTHENTICATED, and
// the failure named neither that role nor preview_profile_photos, which has
// carried them since 20260817000800 because its revoke says `from public, anon`
// and omits authenticated.
//
// A member session legitimately holds SELECT, INSERT, UPDATE or DELETE on
// plenty of tables, so those cannot be asserted away. TRUNCATE, REFERENCES and
// TRIGGER are different: nothing a member does needs them, no migration grants
// them, and their presence means default privileges were never revoked. That
// makes them the tell, and the narrowest one available.
const leaked = await q(`
  select table_name, string_agg(privilege_type, '/' order by privilege_type) privs
  from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
    and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  group by table_name order by table_name`);
check(
  leaked.length === 0,
  `authenticated holds no privilege only default grants confer${leaked.length ? ` — found ${leaked.map((g) => `${g.table_name} (${g.privs})`).join(", ")}` : ""}`,
);

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
  display_name: null,
  birthdate: null,
  community: null,
  condition: null,
  intention: null,
  search_radius_mi: null,
  u_equals_u: false,
  verification_status: "unverified",
  onboarded_at: null,
};
const FULL = {
  display_name: "Sam",
  birthdate: "1990-06-15",
  community: "hiv",
  condition: "hiv",
  intention: "long_term",
  search_radius_mi: 50,
  u_equals_u: true,
  verification_status: "verified",
  onboarded_at: "2026-08-14T00:00:00Z",
};
const CASES = [
  ["a bare row from the sign-up trigger is allowed", EMPTY, true],
  [
    "mismatched community and condition is rejected",
    { ...EMPTY, community: "hsv", condition: "hiv" },
    false,
  ],
  [
    "U=U without the hiv community is rejected",
    { ...EMPTY, community: "hsv", condition: "hsv2", u_equals_u: true },
    false,
  ],
  [
    "an under-18 birthdate is rejected",
    { ...EMPTY, display_name: "Sam", birthdate: "2020-01-01" },
    false,
  ],
  // Liveness runs before basics, so a member can be verified with an empty
  // profile. That is correct and must stay allowed — an administrator upholding
  // an appeal for someone flagged at step 2 depends on it.
  [
    "verified but not yet onboarded is allowed",
    { ...EMPTY, verification_status: "verified" },
    true,
  ],
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
  const violated = Object.entries(r)
    .filter(([, ok]) => ok === false)
    .map(([n]) => n);
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
  check(
    buckets.some((b) => b.id === expected),
    `${expected} bucket exists`,
  );
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
  [
    "hard delete",
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'purge_due_deletions'`,
  ],
  [
    "deletion requests",
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'request_deletion'`,
  ],
  [
    "the fuse sweep",
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'sweep_expired_fuses'`,
  ],
  [
    "consent records",
    `select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'consents'
                         and column_name = 'copy_version'`,
  ],
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
