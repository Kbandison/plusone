import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every registered cron must be callable the way Vercel actually calls it.
 *
 * All five of these shipped exporting only POST while Vercel Cron invokes with
 * GET, so all five 405'd on every fire — scheduled, monitored, and never once
 * run. The purge is the one that matters: §9.3 deletion requests were being
 * recorded and never executed, and the failure mode of a job that does not run
 * is silence, so nothing would have said so.
 *
 * This reads the schedule rather than a list, so registering a sixth cron
 * without a GET fails here instead of in production three weeks later.
 */

const WEB = join(import.meta.dirname, "../..");

interface VercelConfig {
  readonly crons?: readonly {
    readonly path: string;
    readonly schedule: string;
  }[];
}

const config = JSON.parse(readFileSync(join(WEB, "vercel.json"), "utf8")) as VercelConfig;
const crons = config.crons ?? [];

describe("registered cron jobs", () => {
  it("registers the jobs on the never-cut list", () => {
    const paths = crons.map((c) => c.path);
    expect(paths).toContain("/api/cron/purge");
    expect(paths).toContain("/api/cron/fuse-sweep");
  });

  it.each(crons.map((c) => [c.path, c.schedule] as const))(
    "%s is reachable by GET, which is how Vercel invokes it",
    (path) => {
      const route = join(WEB, "src/app", path, "route.ts");
      expect(existsSync(route), `${path} has no route file at ${route}`).toBe(true);

      const source = readFileSync(route, "utf8");
      const exportsGet =
        /export\s+const\s+GET\b/.test(source) || /export\s+async\s+function\s+GET\b/.test(source);

      expect(exportsGet, `${path} does not export GET — Vercel Cron will 405`).toBe(true);
    },
  );

  it.each(crons.map((c) => [c.path] as const))("%s checks its authorisation", (path) => {
    const source = readFileSync(join(WEB, "src/app", path, "route.ts"), "utf8");
    // A cron endpoint is a public URL. Every one of them must gate on the
    // shared secret before it touches anything.
    expect(source).toMatch(/isAuthorisedCron/);
  });

  it("gives every cron a valid five-field schedule", () => {
    for (const cron of crons) {
      expect(cron.schedule.trim().split(/\s+/), cron.path).toHaveLength(5);
    }
  });
});
