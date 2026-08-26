#!/usr/bin/env node
/**
 * Applies named migrations to a live database, one transaction each.
 *
 * This exists because migrations reach production here BY HAND, and the tool
 * that would normally do it cannot be used: `supabase db push` reads
 * supabase_migrations.schema_migrations, which holds 28 rows against 87 files on
 * disk. Everything after 2026-08-15 was applied without going through the CLI,
 * so push believes ~59 migrations are pending and would re-run them. Most are
 * not idempotent — `create table`, `create policy`, `alter table ... add
 * constraint` — so the first one fails and the rest never run.
 *
 * Applying by hand is therefore correct, and it is also how 20260824000200 came
 * to sit in the repo for two days without reaching the database. Nothing else
 * would have said so: check:db asserts hand-maintained COUNTS of live objects,
 * so a missing function just makes the expected number smaller.
 *
 * So: explicit filenames, never "apply everything pending" — the ledger cannot
 * be trusted to say what pending means. Each file runs inside a transaction and
 * is rolled back unless every object it declares resolves afterwards.
 *
 * Usage:
 *   SUPABASE_DB_URL='postgresql://...' node scripts/apply-migrations.mjs <file>...
 *   SUPABASE_DB_URL='postgresql://...' node scripts/apply-migrations.mjs --dry-run <file>...
 *
 * --dry-run applies and verifies exactly as normal, then rolls back regardless.
 * Use it first. The only difference in the real run is the COMMIT.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { declaredIn } from "./declared-objects.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "supabase", "migrations");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const files = argv.filter((a) => !a.startsWith("--")).map((f) => path.basename(f));

if (files.length === 0) {
  console.error("Usage: node scripts/apply-migrations.mjs [--dry-run] <migration.sql>...");
  console.error("Names a file, never a range. The migration ledger cannot say what is pending.");
  process.exit(1);
}

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("SUPABASE_DB_URL not set. The scripts do not read .env.local — export it first.");
  process.exit(1);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const one = async (sql, p) => Object.values((await c.query(sql, p)).rows[0] ?? {})[0];

let failed = 0;
for (const file of files) {
  const full = path.join(DIR, file);
  let sql;
  try {
    sql = readFileSync(full, "utf8");
  } catch {
    console.error(`\n${file}\n  not found in supabase/migrations`);
    failed += 1;
    continue;
  }

  // Net of drops, and shared with verify-schema.mjs so the two cannot
  // disagree about what a migration was supposed to leave behind.
  const want = declaredIn(sql);
  console.log(`\n${file}`);

  await c.query("begin");
  const problems = [];
  try {
    await c.query(sql);

    for (const t of want.tables) {
      if (!(await one(`select to_regclass($1)`, [`public.${t}`])))
        problems.push(`table ${t} absent`);
      // A granted table with no policy is silently deny-all, which reads at 2am
      // as "the query returns nothing". check:sql enforces this on the files;
      // this is the same invariant against what Postgres actually did.
      else if (
        (await one(`select relrowsecurity from pg_class where oid = $1::regclass`, [
          `public.${t}`,
        ])) !== true
      )
        problems.push(`table ${t} has RLS disabled`);
    }
    for (const f of want.functions) {
      const n = await one(
        `select count(*)::int from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.proname = $1`,
        [f],
      );
      if (!n) problems.push(`function ${f} absent`);
    }

    if (problems.length || dryRun) {
      await c.query("rollback");
      console.log(
        problems.length
          ? `  ROLLED BACK — ${problems.join("; ")}`
          : `  dry run — applied, verified, rolled back` +
              `  (${want.tables.size} table(s), ${want.functions.size} function(s))`,
      );
      if (problems.length) failed += 1;
    } else {
      await c.query("commit");
      console.log(
        `  committed — ${want.tables.size} table(s), ${want.functions.size} function(s) verified present`,
      );
    }
  } catch (err) {
    await c.query("rollback");
    console.log(`  ROLLED BACK — ${err.message}`);
    failed += 1;
  }
}

await c.end();
console.log(
  failed
    ? `\n${failed} migration(s) did not apply.\n`
    : `\n${dryRun ? "Dry run clean." : "Done."}\n`,
);
process.exit(failed ? 1 : 0);
