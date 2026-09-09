import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const MIGRATIONS = new URL("../../../../../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(fileURLToPath(MIGRATIONS))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(fileURLToPath(new URL(f, MIGRATIONS)), "utf8"))
  .join("\n");

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const noComments = (src: string) =>
  src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "").replace(/^[ \t]*(--|\/\/)[^\n]*$/gm, "");

const code = noComments(sql);
const route = read("./route.ts");
/** Comments stripped: the docblock SAYS "not CRON_SECRET", which a negative match happily finds. */
const routeCode = noComments(route);
const env = read("../../../../../../../packages/config/src/env.ts");

/**
 * A second door into Latest news, for an agent that can read what the cron
 * cannot.
 *
 * Every assertion here is about it being the SAME door as the admin form, and
 * about the key opening nothing else.
 */
describe("two callers, one lock", () => {
  it("validates in the database, not in the route", () => {
    // A copy of the rules in TypeScript is the thing that drifts, and what would
    // drift is "which rooms may receive an authorless post".
    expect(routeCode).toMatch(/supabase\.rpc\("ingest_article"/);
    // It legitimately names latest-news to RESOLVE rooms from a scope — that is
    // routing, not validation. What it must not do is re-check the article
    // itself, because that copy is what drifts.
    expect(routeCode).not.toMatch(/startsWith\("https/);
    expect(routeCode).not.toMatch(/needs a headline|needs a source|must be https/);
  });

  it("makes the admin form a wrapper around the same function", () => {
    // Not a second copy of the checks — admin_post_article is now is_admin()
    // plus a call.
    const wrapper =
      /create or replace function public\.admin_post_article[\s\S]*?\$\$;/g.exec(
        code.slice(code.lastIndexOf("create or replace function public.admin_post_article")),
      )?.[0] ?? "";
    expect(wrapper).toMatch(/is_admin\(\)/);
    expect(wrapper).toMatch(/return public\.ingest_article\(/);
  });

  it("keeps the shared function away from members entirely", () => {
    // A member calling it directly would be posting an authorless article into
    // a room, which is exactly what the wrapper's is_admin() decides.
    expect(code).toMatch(
      /revoke all on function public\.ingest_article[\s\S]{0,120}from public, anon, authenticated/,
    );
    expect(code).toMatch(
      /grant execute on function public\.ingest_article[\s\S]{0,120}to service_role/,
    );
  });
});

describe("the key opens this and nothing else", () => {
  it("uses its own secret, not the cron's", () => {
    // CRON_SECRET opens /api/cron/purge, which deletes accounts. A token pasted
    // into an outside tool must not be convertible into that.
    expect(routeCode).toMatch(/NEWS_INGEST_SECRET/);
    expect(routeCode).not.toMatch(/CRON_SECRET/);
    expect(routeCode).not.toMatch(/isAuthorisedCron/);
  });

  it("is closed while the secret is unset", () => {
    // Otherwise an unconfigured deploy accepts an empty bearer token as matching
    // an empty secret, and the door is open on every preview.
    expect(routeCode).toMatch(/if \(!NEWS_INGEST_SECRET\) return false;/);
  });

  it("compares in constant time", () => {
    expect(route).toMatch(/diff \|= presented\.charCodeAt\(i\) \^ expected\.charCodeAt\(i\)/);
  });

  it("declares the secret as optional with a length floor", () => {
    // Optional so the app runs without it; .min(32) still applies when present,
    // so a short one is a startup error rather than a weak door.
    expect(noComments(env)).toMatch(/NEWS_INGEST_SECRET: z\.string\(\)\.min\(32\)\.optional\(\)/);
  });
});

describe("what it will not do", () => {
  it("requires the scope to be stated", () => {
    // The call an agent is most likely to get wrong — a feed filed tuberculosis
    // under herpes — so it is never a default.
    // Anchored at the `if`, so a PREFIXED guard fails. `if (scope && scope !== …)`
    // still contains the old substring while quietly letting an empty scope
    // through, which is how the first version of this passed a sabotage.
    expect(routeCode).toMatch(/if \(scope !== "hsv" && scope !== "hiv" && scope !== "both"\)/);
    // And nothing may supply one. A `|| "both"` on the read is the other way an
    // unstated scope reaches a community.
    expect(routeCode).not.toMatch(/article\.scope[\s\S]{0,40}\|\|/);
  });

  it("bounds a batch", () => {
    expect(routeCode).toMatch(/articles\.length > 25/);
  });

  it("reports a partial success as partial", () => {
    // A 200 on a mixed batch reads as "all four posted" when one had a bad link.
    expect(routeCode).toMatch(/failed > 0 && added > 0 \? 207/);
  });

  it("logs counts and not article text", () => {
    const log = /console\.info\([\s\S]{0,220}?\);/.exec(route)?.[0] ?? "";
    expect(log).toMatch(/at: "news\.ingest"/);
    expect(log).not.toMatch(/title|url|summary/);
  });
});
