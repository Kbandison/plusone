import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every TypeScript file under `apps/web/src`, for the tests that assert a rule
 * lives in exactly one place.
 *
 * ── why this is shared rather than written twice ────────────────────────────
 *
 * Because the alternative is the bug these tests exist to catch. `2ab1de0`
 * found two readings of "is Stripe charging" in two files, disagreeing about a
 * null period end, and the test guarding it could not see the second one — it
 * pinned the shape of a line in the file it was pointed at. `f8ad836` answered
 * that by pointing an assertion at every file instead.
 *
 * A second copy of THIS walker would reintroduce the same shape one level up:
 * two scanners, one skipping a directory the other visits, and a rival
 * implementation sitting in the gap between them. So there is one, and the
 * tests that sweep the repository all take it from here.
 *
 * Test-only. Nothing in the app imports it — it reads the filesystem at module
 * scope, which is fine in vitest and wrong anywhere a request is being served.
 */
export const SOURCE_ROOT = join(import.meta.dirname, "..");

const SKIP = new Set(["node_modules", "dist", ".next", ".turbo"]);

export function sourceFiles(dir: string = SOURCE_ROOT, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(path);
  }
  return acc;
}

/** Repo-relative, so a failure names something somebody can open. */
export function relative(path: string): string {
  return path.slice(SOURCE_ROOT.length + 1);
}

/**
 * Files that break a rule, named for the failure message.
 *
 * `allowed` is an allow-list of path suffixes, and being on one is a claim that
 * somebody looked — the same reason `copy-is-wired.test.ts` keeps its
 * `KNOWINGLY_UNUSED`. An exception nobody has to justify stops being an
 * exception.
 */
export function filesMatching(
  pattern: RegExp,
  allowed: readonly string[],
  read: (path: string) => string,
): string[] {
  return sourceFiles()
    .filter((path) => !allowed.some((suffix) => path.endsWith(suffix)))
    .filter((path) => pattern.test(read(path)))
    .map(relative);
}
