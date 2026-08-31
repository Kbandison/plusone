import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Copy that was written and never wired up.
 *
 * Three separate defects had this shape. `previewCtaAria` described a control
 * that was never built, so the Preview Drop's call to action was an
 * accent-coloured paragraph that did nothing. `savePrompts` returned "Saved."
 * to a component that only ever rendered `state.error`, so saving your prompts
 * gave no feedback at all. `blockConfirm` describes a confirmation dialogue
 * that does not exist.
 *
 * Each one is a decision someone made, written down, and then quietly not
 * implemented — and nothing in the build noticed, because unused data is not a
 * type error. This notices.
 */

const DRAFT = join(import.meta.dirname, "../../../../packages/config/src/draft-copy.ts");
const ROOTS = [join(import.meta.dirname, ".."), join(import.meta.dirname, "../../../../packages")];

/**
 * Deliberately unused, with the reason.
 *
 * Being on this list is a claim that somebody looked. Delete an entry when the
 * thing gets built.
 */
const KNOWINGLY_UNUSED: Record<string, string> = {
  /**
   * The front-door call to action, unwired for the duration of the closed beta.
   *
   * `/` and the marketing header both pointed at `/onboarding/phone` with this
   * label. Since 2026-08-31 no account can be created without an invitation, so
   * that was a button leading to a refusal, and both now say
   * DRAFT_COPY.waitlist.submit and go to `/waitlist`.
   *
   * Kept rather than deleted because it is the exact string that comes back
   * when the beta opens, and because this map cleans itself: the moment
   * anything references `.getStarted` again, the assertion above fails and
   * demands this entry be removed. An excuse here cannot outlive its reason.
   *
   * Reopening is BACKLOG server 22, so this is not the only record of it — a
   * note that describes work without creating any is how the Play diagnostic
   * panel nearly shipped to members.
   */
  getStarted: "closed beta — the front door is /waitlist until it opens. BACKLOG server 22.",
};

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(path, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
    if (path === DRAFT) continue;
    acc.push(path);
  }
  return acc;
}

describe("every string in DRAFT_COPY is used", () => {
  const draft = readFileSync(DRAFT, "utf8");
  // Keys at any depth: `foo: "..."` or `foo: (n) => ...`.
  const keys = [
    ...new Set([...draft.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((m) => m[1]!)),
  ];

  const corpus = sourceFiles(ROOTS[0]!)
    .concat(sourceFiles(ROOTS[1]!))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  it("finds the keys and the code", () => {
    // Both halves have to be non-empty or every assertion below passes vacuously.
    expect(keys.length).toBeGreaterThan(40);
    expect(corpus.length).toBeGreaterThan(50_000);
  });

  it.each(keys.map((k) => [k]))("%s is referenced somewhere", (key) => {
    const used = new RegExp(`\\.${key}\\b`).test(corpus);
    const excused = key in KNOWINGLY_UNUSED;

    if (excused) {
      // If it gets wired up, the excuse should go rather than linger as a lie.
      expect(used, `${key} is used now — remove it from KNOWINGLY_UNUSED`).toBe(false);
      return;
    }

    expect(used, `${key} is written and never referenced — wire it up or list why not`).toBe(true);
  });
});
