import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A `"use server"` module may export ONLY async functions.
 *
 * Every action file in this app exported its state type and an `X_INITIAL`
 * constant alongside the actions, and that is fine right up until a Server
 * Component imports the file — then it fails at "collect page data" with an
 * error pointing at the last line of the last function, a long way from the
 * const that actually caused it.
 *
 * It bit twice in one session, both times on a new page that imported an action
 * directly. Nothing in typecheck or lint sees it, because the code is valid
 * TypeScript; the rule is a framework one. So it is checked here.
 *
 * The state lives in a sibling `state.ts` now — imported by the actions and by
 * the components, and exporting nothing that has to run.
 */

const ROOT = join(import.meta.dirname, "..");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(path, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(path);
  }
  return acc;
}

const serverModules = sourceFiles(ROOT).filter((path) => {
  const first = readFileSync(path, "utf8").split("\n")[0] ?? "";
  return first.includes('"use server"');
});

describe('"use server" modules', () => {
  it("finds the action files at all", () => {
    // A silent zero would make every assertion below vacuous.
    expect(serverModules.length).toBeGreaterThan(10);
  });

  it.each(serverModules.map((p) => [p.slice(ROOT.length + 1)]))(
    "%s exports only functions",
    (relative) => {
      const source = readFileSync(join(ROOT, relative), "utf8");
      // Only value exports matter: `export type` and `export interface` are
      // erased at compile time and produce no runtime export at all.
      const offenders = [...source.matchAll(/^export (?:const|let|var|class) (\w+)(.*)$/gm)]
        .filter(([, , rest]) => !/=\s*(async\s*)?(\(|function\b)/.test(rest ?? ""))
        .map(([, name]) => name);

      expect(
        offenders,
        `${relative} exports non-functions from a "use server" module — move them to a sibling state.ts`,
      ).toEqual([]);
    },
  );
});
