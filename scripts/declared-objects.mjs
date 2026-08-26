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

/** Objects one file's SQL leaves behind, net of what it drops, in order. */
export function declaredIn(sql) {
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
  for (const file of readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(path.join(DIR, file), "utf8");
    for (const [, verb, kind, name] of sql.matchAll(STATEMENT)) {
      const map = out[KIND[kind]];
      if (verb === "create") map.set(name, file);
      else map.delete(name);
    }
  }
  return out;
}
