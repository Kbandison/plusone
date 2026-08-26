/**
 * What the migration files promise the database will contain.
 *
 * Shared by verify-schema.mjs, which compares it against a live database, and
 * apply-migrations.mjs, which checks a migration left behind what it declared.
 * One parser rather than two: they answer the same question, and two of them
 * would eventually disagree about it in a way nobody would notice until one of
 * them was wrong about production.
 *
 * ── two things this has to get right ────────────────────────────────────────
 *
 * Drops are subtracted. Three absences that are correct rather than missing
 * work, and which a create-only reading would report as drift on every run:
 *
 *   public.shares_room        created 20260813000300, dropped 20260814001000
 *   public.news_items         created 20260820000200, dropped 20260820000400
 *   public.admin_update_news_item, admin_delete_news_item — the same pair
 *
 * And ORDER decides, within a file as well as across them. 20260818000100 drops
 * public.visible_profiles and recreates it a few lines later, which is the
 * ordinary way to change a view's column list. Collecting every create and then
 * subtracting every drop nets that to "absent" — a live view reported as
 * missing, or worse, silently dropped from the set being checked at all. So
 * this walks the statements in the order they appear and applies each in turn.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "supabase", "migrations");

/**
 * One ordered pass. `g` gives each match its index, so a drop at position 400
 * undoes a create at 100 and never the other way round.
 */
const STATEMENT =
  /(create|drop)\s+(?:or replace\s+)?(?:if exists\s+)?(table|view|function)\s+(?:if not exists\s+)?(?:if exists\s+)?public\.(\w+)/g;

const KIND = { table: "tables", view: "views", function: "functions" };

/**
 * SQL only, with the prose taken out.
 *
 * Not optional. These files carry more comment than code, and the comments are
 * written in English about the very things being searched for — a first pass
 * looking for `constraint <name>` matched "constraint violation", "constraint
 * if", "constraint has" and half a dozen others, and reported nine migrations
 * as never applied. A checker whose false positives outnumber its findings is
 * one nobody will believe the day it is right.
 *
 * Dollar-quoted function bodies are left alone: a `--` inside one is part of
 * the body, and cutting there would truncate the statement.
 */
export function stripComments(sql) {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, (body) => body.replace(/--[^\n]*/g, ""))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/** Objects one file's SQL leaves behind, net of what it drops, in order. */
export function declaredIn(raw) {
  // Prose out first, for the reason stripComments gives: these files comment
  // heavily and in English, about the same statements being searched for.
  const sql = typeof raw === "string" ? stripComments(raw) : raw;
  const out = { tables: new Set(), functions: new Set(), views: new Set() };
  for (const [, verb, kind, name] of sql.matchAll(STATEMENT)) {
    const set = out[KIND[kind]];
    if (verb === "create") set.add(name);
    else set.delete(name);
  }
  return out;
}

/**
 * The same across every migration in filename order, so a later file's drop
 * removes an earlier file's create. Each surviving name maps to the file that
 * last created it — which is the one to apply when it turns out to be missing,
 * and therefore the useful half of a failure message.
 */
export function declaredEverywhere() {
  const out = { tables: new Map(), functions: new Map(), views: new Map() };
  for (const file of migrationFiles()) {
    const sql = stripComments(readFileSync(path.join(DIR, file), "utf8"));
    for (const [, verb, kind, name] of sql.matchAll(STATEMENT)) {
      const map = out[KIND[kind]];
      if (verb === "create") map.set(name, file);
      else map.delete(name);
    }
  }
  return out;
}

/** Every migration, in the order Postgres would have seen them. */
export function migrationFiles() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export const MIGRATIONS_DIR = DIR;

/** Names one file removes, so an earlier file's evidence can be discounted. */
export function droppedIn(raw) {
  const sql = stripComments(raw);
  const out = {
    objects: new Set(),
    constraints: new Set(),
    policies: new Set(),
    indexes: new Set(),
    columns: new Set(),
  };
  for (const m of sql.matchAll(/drop\s+(?:table|view|function)\s+(?:if exists\s+)?public\.(\w+)/gi))
    out.objects.add(m[1]);
  for (const m of sql.matchAll(/drop\s+constraint\s+(?:if exists\s+)?(\w+)/gi))
    out.constraints.add(m[1]);
  for (const m of sql.matchAll(/drop\s+policy\s+(?:if exists\s+)?"([^"]+)"/gi))
    out.policies.add(m[1]);
  for (const m of sql.matchAll(/drop\s+index\s+(?:if exists\s+)?(?:public\.)?(\w+)/gi))
    out.indexes.add(m[1]);
  for (const m of sql.matchAll(/drop\s+column\s+(?:if exists\s+)?(\w+)/gi)) out.columns.add(m[1]);
  return out;
}

/**
 * Everything one migration would leave a trace of, for asking a database
 * whether it ever ran.
 *
 * Wider than `declaredIn` on purpose. That answers "did this migration leave
 * behind what it declared", which is enough to decide whether to commit it.
 * This answers a harder question — "was this file EVER applied, months ago" —
 * and a name-only reading is too weak for it: a migration that adds a column, a
 * constraint or a policy creates no table and no function, and would look
 * indistinguishable from one that never ran.
 *
 * That distinction is the whole risk in backfilling a ledger. Recording a
 * migration as applied when it was not means `supabase db push` skips it
 * forever, and the schema silently never catches up.
 */
export function evidenceIn(raw) {
  const sql = stripComments(raw);
  const out = {
    tables: [],
    views: [],
    functions: [],
    constraints: [],
    policies: [],
    indexes: [],
    columns: [],
  };
  const { tables, views, functions } = declaredIn(sql);
  out.tables = [...tables];
  out.views = [...views];
  out.functions = [...functions];

  /**
   * One ordered walk, remembering which table is being talked about.
   *
   * Constraints and indexes have to be attributed to a table, not just named,
   * because dropping a table takes its constraints and indexes with it — so
   * 20260820000200's news_items_title_len is correctly absent today and is not
   * evidence that the migration never ran. Attribution is what tells those two
   * cases apart.
   *
   * `create table public.x` and `alter table public.x` both set the subject,
   * and inline constraints belong to whichever came last. That is exactly how
   * the SQL reads, and these files are ordinary DDL rather than anything clever.
   */
  const TOKEN = new RegExp(
    [
      /(?<createTable>create\s+table\s+(?:if not exists\s+)?public\.(?<ctName>\w+))/.source,
      /(?<alterTable>alter\s+table\s+(?:only\s+)?public\.(?<atName>\w+))/.source,
      /(?<dropConstraint>drop\s+constraint\s+(?:if exists\s+)?(?<dcName>\w+))/.source,
      /(?<constraint>constraint\s+(?<cName>\w+))/.source,
      /(?<index>create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if not exists\s+)?(?<iName>\w+)\s+on\s+public\.(?<iTable>\w+))/
        .source,
      /(?<column>add\s+column\s+(?:if exists\s+)?(?:if not exists\s+)?(?<colName>\w+))/.source,
      /(?<policy>create\s+policy\s+"(?<pName>[^"]+)"\s+on\s+public\.(?<pTable>\w+))/.source,
    ].join("|"),
    "gis",
  );

  let subject = null;
  for (const m of sql.matchAll(TOKEN)) {
    const g = m.groups ?? {};
    if (g.createTable) subject = g.ctName;
    else if (g.alterTable) subject = g.atName;
    // `drop constraint if exists x` matches the bare `constraint` rule too, and
    // the name it would capture is the word `if`. Consuming the drop form FIRST
    // is what stops nine migrations being reported as never applied.
    else if (g.dropConstraint) out.constraints = out.constraints.filter((k) => k.name !== g.dcName);
    else if (g.constraint) out.constraints.push({ name: g.cName, table: subject });
    else if (g.index) out.indexes.push({ name: g.iName, table: g.iTable });
    else if (g.column) out.columns.push({ column: g.colName, table: subject });
    else if (g.policy) out.policies.push({ name: g.pName, table: g.pTable });
  }

  for (const m of sql.matchAll(
    /drop\s+policy\s+(?:if exists\s+)?"([^"]+)"\s+on\s+public\.(\w+)/gi,
  )) {
    out.policies = out.policies.filter((p) => !(p.name === m[1] && p.table === m[2]));
  }
  for (const m of sql.matchAll(/drop\s+index\s+(?:if exists\s+)?(?:public\.)?(\w+)/gi)) {
    out.indexes = out.indexes.filter((i) => i.name !== m[1]);
  }
  for (const m of sql.matchAll(/drop\s+column\s+(?:if exists\s+)?(\w+)/gi)) {
    out.columns = out.columns.filter((c) => c.column !== m[1]);
  }

  return out;
}

/**
 * The whole schema the migrations add up to, and which file last put each piece
 * there.
 *
 * `declaredEverywhere` answers the same question for tables, views and
 * functions only, which turned out to be too narrow twice over. A migration
 * that adds a COLUMN and a CONSTRAINT creates no object at all — 20260826000300
 * is exactly that shape — so `check:db` called the schema a match while that
 * migration sat unapplied, which is the same false reassurance that let
 * emails_for() go missing for two days.
 *
 * The value is the owning file, which two callers need for different reasons:
 * verify-schema names it when something is absent, and
 * backfill-migration-ledger uses it to decide whether an object's existence is
 * evidence THAT file ran — if a later migration recreated it, the object would
 * be there either way and proves nothing.
 *
 * Drops cascade. Removing a table takes its constraints, indexes, policies and
 * columns with it, silently and without naming any of them, so without the
 * cascade every one of news_items' three constraints reads as missing work.
 */
export function finalState() {
  const out = {
    objects: new Map(),
    constraints: new Map(),
    policies: new Map(),
    indexes: new Map(),
    columns: new Map(),
  };
  const tableOf = new Map();

  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(DIR, file), "utf8");
    const gone = droppedIn(sql);

    // Drops first, creates second: a file that drops and recreates in one
    // breath — the ordinary way to change a function's signature or a view's
    // columns — must end up owning the thing, not having removed it.
    for (const key of Object.keys(out)) for (const n of gone[key]) out[key].delete(n);
    for (const table of gone.objects) {
      for (const [key, owner] of out.constraints)
        if (owner.table === table) out.constraints.delete(key);
      for (const [key, owner] of out.indexes) if (owner.table === table) out.indexes.delete(key);
      for (const key of out.policies.keys())
        if (key.startsWith(`${table}.`)) out.policies.delete(key);
      for (const key of out.columns.keys())
        if (key.startsWith(`${table}.`)) out.columns.delete(key);
      tableOf.delete(table);
    }

    const made = evidenceIn(sql);
    for (const n of [...made.tables, ...made.views, ...made.functions])
      out.objects.set(n, { file });
    for (const k of made.constraints) out.constraints.set(k.name, { file, table: k.table });
    for (const p of made.policies) out.policies.set(`${p.table}.${p.name}`, { file });
    for (const i of made.indexes) out.indexes.set(i.name, { file, table: i.table });
    for (const c of made.columns) out.columns.set(`${c.table}.${c.column}`, { file });
  }
  return out;
}
