#!/usr/bin/env node
/**
 * Tells `supabase_migrations.schema_migrations` the truth about what has run.
 *
 * The ledger holds 28 rows and stops at 2026-08-15. Everything after that was
 * applied by hand, outside the CLI, so nothing recorded it. The practical cost
 * is that `supabase db push` believes ~60 migrations are pending and would
 * re-run them into `already exists` — which is why HANDOFF says not to use it,
 * and why scripts/apply-migrations.mjs exists at all.
 *
 * Backfilling makes push usable again. It is also the single most dangerous
 * edit available here: a migration recorded as applied when it was NOT is one
 * that push will skip forever, and the schema silently never catches up. The
 * failure has no symptom until something reads a column that does not exist.
 *
 * So nothing is taken on trust. For every unrecorded migration this reads the
 * file, works out what it would have left behind, and asks the database whether
 * that is there — tables, views, functions, named constraints, policies,
 * indexes and added columns. Only a file whose every trace is present gets a
 * row. Anything else is reported and skipped.
 *
 * Three outcomes, and the middle one is the interesting one:
 *
 *   verified     every trace present. Backfilled.
 *   no evidence  the file only grants, revokes, or writes rows, so there is
 *                nothing a schema can be asked. NOT backfilled without
 *                --include-unverifiable, because "I could not check" and "I
 *                checked and it is fine" must not look the same.
 *   missing      traces absent. Almost certainly never applied — apply it with
 *                apply-migrations.mjs rather than recording it here.
 *
 * Usage:
 *   SUPABASE_DB_URL='postgresql://...' node scripts/backfill-migration-ledger.mjs
 *   SUPABASE_DB_URL='postgresql://...' node scripts/backfill-migration-ledger.mjs --write
 *   ... --write --include-unverifiable
 *
 * Reports and changes nothing unless --write is given.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

import { MIGRATIONS_DIR, droppedIn, evidenceIn, migrationFiles } from "./declared-objects.mjs";

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const includeUnverifiable = argv.includes("--include-unverifiable");

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("SUPABASE_DB_URL not set. The scripts do not read .env.local — export it first.");
  process.exit(1);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const one = async (sql, p) => Object.values((await c.query(sql, p)).rows[0] ?? {})[0];

const already = new Set(
  (await c.query(`select version from supabase_migrations.schema_migrations`)).rows.map(
    (r) => r.version,
  ),
);

/** `20260826000100_a_third_way.sql` → version and name, the CLI's own split. */
const split = (file) => {
  const base = file.replace(/\.sql$/, "");
  const at = base.indexOf("_");
  return at === -1
    ? { version: base, name: base }
    : { version: base.slice(0, at), name: base.slice(at + 1) };
};

const verified = [];
const unverifiable = [];
const missing = [];

const files = migrationFiles();
const read = (f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");

/**
 * Who a thing belongs to at the end of the whole sequence.
 *
 * Only the LAST migration to create something can use its existence as evidence
 * of having run, and getting this rule right took two wrong ones:
 *
 *   · Subtracting anything a later file drops. That was too aggressive.
 *     `room_feed` and `room_thread` are dropped and immediately recreated by
 *     later migrations — the ordinary way to change a function's signature — so
 *     "dropped later" threw away evidence for objects that are present right
 *     now. Ten migrations were being reported as unverifiable that were not.
 *   · Not subtracting at all. Too generous in the other direction:
 *     20260820000200 creates news_items and 20260820000400 drops it, so its
 *     absence today is correct and is not a sign that anything failed.
 *
 * What is actually sound is ownership. Walking the files in order and letting
 * each one's drops then creates take effect leaves every name pointing at the
 * file that last put it there. If that file is X, then finding the object is
 * evidence X ran. If it is somebody later, the object would be there whether X
 * ran or not, and proves nothing about X.
 */
const owner = {
  objects: new Map(),
  constraints: new Map(),
  policies: new Map(),
  indexes: new Map(),
  columns: new Map(),
};
for (const file of files) {
  const sql = read(file);
  const gone = droppedIn(sql);
  // Drops first, creates second: within one file `evidenceIn` has already
  // resolved a drop-then-recreate to "created", and that must win here too.
  for (const k of Object.keys(owner)) for (const n of gone[k]) owner[k].delete(n);
  // And dropping a TABLE takes its constraints, indexes, policies and columns
  // with it, silently and without naming any of them. Without this cascade
  // 20260820000200 still looks unapplied: news_items is gone, so
  // news_items_title_len cannot be found, and nothing said it was dropped.
  for (const table of gone.objects) {
    for (const [key, held] of owner.constraints)
      if (held.table === table) owner.constraints.delete(key);
    for (const [key, held] of owner.indexes) if (held.table === table) owner.indexes.delete(key);
    for (const key of owner.policies.keys())
      if (key.startsWith(`${table}.`)) owner.policies.delete(key);
    for (const key of owner.columns.keys())
      if (key.startsWith(`${table}.`)) owner.columns.delete(key);
  }
  const made = evidenceIn(sql);
  for (const n of [...made.tables, ...made.views, ...made.functions]) owner.objects.set(n, file);
  for (const k of made.constraints) owner.constraints.set(k.name, { file, table: k.table });
  for (const p of made.policies) owner.policies.set(`${p.table}.${p.name}`, { file });
  for (const i of made.indexes) owner.indexes.set(i.name, { file, table: i.table });
  for (const c of made.columns) owner.columns.set(`${c.table}.${c.column}`, { file });
}

for (const file of files) {
  const { version, name } = split(file);
  if (already.has(version)) continue;

  const raw = evidenceIn(read(file));
  const mine = (map, key) => map.get(key)?.file === file || map.get(key) === file;
  const want = {
    tables: raw.tables.filter((t) => mine(owner.objects, t)),
    views: raw.views.filter((v) => mine(owner.objects, v)),
    functions: raw.functions.filter((f) => mine(owner.objects, f)),
    constraints: raw.constraints.filter((k) => mine(owner.constraints, k.name)),
    policies: raw.policies.filter((p) => mine(owner.policies, `${p.table}.${p.name}`)),
    indexes: raw.indexes.filter((i) => mine(owner.indexes, i.name)),
    columns: raw.columns.filter((c) => mine(owner.columns, `${c.table}.${c.column}`)),
  };
  const absent = [];

  for (const t of want.tables) {
    if (!(await one(`select to_regclass($1)`, [`public.${t}`]))) absent.push(`table ${t}`);
  }
  for (const v of want.views) {
    if (
      !(await one(`select count(*)::int from pg_views where schemaname='public' and viewname=$1`, [
        v,
      ]))
    )
      absent.push(`view ${v}`);
  }
  for (const f of want.functions) {
    if (
      !(await one(
        `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname=$1`,
        [f],
      ))
    )
      absent.push(`function ${f}`);
  }
  for (const k of want.constraints) {
    if (!(await one(`select count(*)::int from pg_constraint where conname=$1`, [k.name])))
      absent.push(`constraint ${k.name}`);
  }
  for (const p of want.policies) {
    if (
      !(await one(
        `select count(*)::int from pg_policies where schemaname='public' and tablename=$1 and policyname=$2`,
        [p.table, p.name],
      ))
    )
      absent.push(`policy "${p.name}" on ${p.table}`);
  }
  for (const i of want.indexes) {
    if (
      !(await one(
        `select count(*)::int from pg_indexes where schemaname='public' and indexname=$1`,
        [i.name],
      ))
    )
      absent.push(`index ${i.name}`);
  }
  for (const col of want.columns) {
    if (
      !(await one(
        `select count(*)::int from information_schema.columns
          where table_schema='public' and table_name=$1 and column_name=$2`,
        [col.table, col.column],
      ))
    )
      absent.push(`column ${col.table}.${col.column}`);
  }

  const traces =
    want.tables.length +
    want.views.length +
    want.functions.length +
    want.constraints.length +
    want.policies.length +
    want.indexes.length +
    want.columns.length;

  if (absent.length) missing.push({ file, version, name, absent });
  else if (traces === 0) unverifiable.push({ file, version, name });
  else verified.push({ file, version, name, traces });
}

console.log(
  `ledger holds ${already.size}; ${verified.length + unverifiable.length + missing.length} files are unrecorded\n`,
);

console.log(`verified — every trace present (${verified.length}):`);
for (const m of verified) console.log(`  ${m.version}  ${m.name} (${m.traces} traces)`);

console.log(`\nno evidence — grants, revokes or data only (${unverifiable.length}):`);
for (const m of unverifiable) console.log(`  ${m.version}  ${m.name}`);

console.log(`\nMISSING — traces absent, so probably never applied (${missing.length}):`);
for (const m of missing) console.log(`  ${m.version}  ${m.name}\n      ${m.absent.join(", ")}`);

const toWrite = includeUnverifiable ? [...verified, ...unverifiable] : verified;

if (!write) {
  console.log(
    `\nDry run. --write would record ${toWrite.length}` +
      (includeUnverifiable
        ? " (including the unverifiable ones)."
        : ", leaving the unverifiable ones out."),
  );
  await c.end();
  process.exit(0);
}

// One transaction. A half-backfilled ledger is worse than an empty one: it
// would look authoritative about a range it does not cover.
await c.query("begin");
try {
  for (const m of toWrite) {
    await c.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ($1, $2, null) on conflict (version) do nothing`,
      [m.version, m.name],
    );
  }
  await c.query("commit");
  console.log(`\nRecorded ${toWrite.length}.`);
} catch (err) {
  await c.query("rollback");
  console.error(`\nROLLED BACK — ${err.message}`);
  await c.end();
  process.exit(1);
}

const total = await one(`select count(*)::int from supabase_migrations.schema_migrations`);
console.log(`Ledger now holds ${total} of ${migrationFiles().length} files.`);
if (missing.length) {
  console.log(`${missing.length} still unrecorded and unapplied — use apply-migrations.mjs.`);
}
await c.end();
