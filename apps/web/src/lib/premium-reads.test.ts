import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, acc);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(path);
  }
  return acc;
}

const files = sources(SRC);

/**
 * Nobody asks the database whether SOMEBODY ELSE is premium.
 *
 * `is_premium(uuid)` is revoked from `authenticated` — 20260814001000 closed a
 * uuid-probe leak by taking the two-argument forms away from members and
 * leaving self-relative wrappers. `i_am_premium()` is the one a page may call.
 *
 * The failure when you get this wrong is the worst shape available. The call
 * returns "permission denied"; supabase-js RESOLVES rather than rejects, so
 * nothing throws; `data` comes back null; and null reads as "not premium". A
 * paying member is silently handed the free tier, on every render, with no
 * error anywhere.
 *
 * This app has shipped that bug once — the premium settings page carries a
 * comment about it — and I wrote it a second time building 18d, where it would
 * have locked five filter groups against every subscriber. Twice is a pattern,
 * and a pattern is what a test is for.
 */
describe("premium is read self-relatively", () => {
  it("finds the sources at all", () => {
    // Every assertion below is "no file does X", so a zero-length list would
    // pass forever.
    expect(files.length).toBeGreaterThan(50);
  });

  it("never calls the revoked two-argument form from the app", () => {
    const offenders = files.filter((f) =>
      /rpc\(\s*["'`]is_premium["'`]/.test(readFileSync(f, "utf8")),
    );
    expect(
      offenders.map((f) => f.replace(SRC, "src")),
      "call i_am_premium() — is_premium(uuid) is revoked from authenticated and " +
        "resolves to null, which reads as 'not premium' for a paying member",
    ).toEqual([]);
  });

  it("still has somewhere that reads it correctly", () => {
    const users = files.filter((f) =>
      /rpc\(\s*["'`]i_am_premium["'`]/.test(readFileSync(f, "utf8")),
    );
    expect(users.length).toBeGreaterThan(1);
  });
});
