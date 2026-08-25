import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * §9.6 and the privacy policy's "Logs and diagnostics", which says: "Those logs
 * identify accounts by an opaque id. Message contents and profile fields are
 * stripped before anything is recorded, and no condition information appears in
 * any event we log."
 *
 * That claim was true when audited on 2026-08-25 — thirty-four call sites, all
 * of them fixed strings, provider error messages, enums or opaque ids — and
 * nothing enforced it. It held because several authors happened to be careful,
 * and web-push.ts even says so at the line: "the log carries the event and a
 * status, never the recipient's endpoint, which is a device identifier."
 *
 * Careful is not a mechanism. One `console.error("upload failed", row)` in a
 * catch block puts a display name or a message body into a log that is retained
 * and, once a native shell ships, forwarded somewhere. This is the audit made
 * permanent.
 *
 * It reads source rather than intercepting a logger because there is no logger:
 * every one of these is a bare `console.*`, and introducing an abstraction to
 * make them testable would be a bigger change than the rule is worth.
 */
const ROOTS = [join(import.meta.dirname, ".."), join(import.meta.dirname, "../../../../packages")];

/** Every shipped .ts/.tsx — tests excluded, since a fixture is not a log. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) acc.push(path);
  }
  return acc;
}

/**
 * The text of every console.* call, roughly.
 *
 * Balanced to the closing paren rather than regex-matched to it, because these
 * calls nest JSON.stringify and object literals and a lazy match stops at the
 * first `)` inside one.
 */
function logCalls(source: string): string[] {
  const calls: string[] = [];
  const start = /console\.(log|info|warn|error|debug)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = start.exec(source)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") depth -= 1;
    }
    calls.push(source.slice(match.index, i));
  }
  return calls;
}

/**
 * `at:` names the site and is allowed to say anything — "email.send",
 * "notify.record". Stripped before the check, or every label containing a
 * forbidden word would fail on its own name.
 */
const withoutLabels = (call: string) => call.replace(/at:\s*"[^"]*"/g, "");

/**
 * Property reads that would put a person into a log line.
 *
 * Deliberately about ACCESS rather than words: `problem: error.message` is
 * fine and `body: message.body` is not, and only the second is a read of
 * somebody's content. Bare identifiers are matched too, because
 * `console.error("failed", { displayName })` is the shorthand that slips.
 */
const FORBIDDEN = [
  /\.body\b/,
  /\bdisplay_?[Nn]ame\b/,
  /\.bio\b/,
  /\bprompt(s|_answers)?\b/,
  /\bcommunity\b/,
  /\bcondition(_type)?\b/,
  /\bbirth_?date\b/,
  /\bphone\b/,
  /\bendpoint\b/,
  /\bp256dh\b/,
  /\bquiz\w*\b/,
  /\blocation\b/,
  /\bemail\b(?!\.)/,
];

describe("logs cannot carry a person", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root));

  it("finds the logging it is supposed to be checking", () => {
    // A guard that silently matches nothing is worse than no guard: it reports
    // success forever while the thing it watches moves out from under it.
    const total = files.reduce((n, f) => n + logCalls(readFileSync(f, "utf8")).length, 0);
    expect(files.length).toBeGreaterThan(50);
    expect(total).toBeGreaterThan(20);
  });

  it("never reads a message body, a profile field, or a condition into one", () => {
    const offences: string[] = [];

    for (const file of files) {
      for (const call of logCalls(readFileSync(file, "utf8"))) {
        const checked = withoutLabels(call);
        for (const pattern of FORBIDDEN) {
          if (pattern.test(checked)) {
            offences.push(
              `${file.replace(/.*\/(apps|packages)\//, "$1/")}: ${pattern} in ${checked
                .replace(/\s+/g, " ")
                .slice(0, 120)}`,
            );
          }
        }
      }
    }

    expect(offences).toEqual([]);
  });
});
