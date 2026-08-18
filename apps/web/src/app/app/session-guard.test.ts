import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Every source file behind the signed-in area, plus the libs it calls. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    if (!/\.tsx?$/.test(entry) || entry.includes(".test.")) return [];
    return [full];
  });
}

const roots = [
  fileURLToPath(new URL(".", import.meta.url)),
  fileURLToPath(new URL("../../lib", import.meta.url)),
];
const files = roots.flatMap(sources);

/**
 * What this caught in production: `GET /app 307` with
 * `TypeError: Cannot read properties of null (reading 'id')`, digest 2230242432.
 *
 * `/app/layout.tsx` redirects a signed-out visitor, and every page under it
 * leaned on that — then read `auth.user!.id` anyway. A layout and its page
 * render CONCURRENTLY, so the page dereferences null before the layout's
 * redirect lands. On a page the member still gets the 307 and only the log
 * knows; in a server action there is no layout at all, so an expired session
 * turned "send this message" into an unhandled TypeError instead of a trip to
 * /sign-in. Twenty-four sites, all one habit.
 *
 * The assertion is the bug: `!` tells the compiler to stop asking the one
 * question that had a wrong answer.
 */
describe("nothing behind the wall asserts that a session exists", () => {
  it("never writes user! ", () => {
    const offenders = files.filter((f) => /\.user!/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  /**
   * And the guard has to be a redirect, not a silent skip: a member whose
   * session lapsed mid-session needs somewhere to go, and every one of these
   * files is a page or a server action, both of which may redirect.
   */
  it("guards every getUser with a redirect", () => {
    const missing: string[] = [];
    for (const f of files) {
      const source = readFileSync(f, "utf8");
      const calls = source.match(
        /const \{ data(?:: \w+)? \} = await supabase\.auth\.getUser\(\);/g,
      );
      if (!calls) continue;
      for (const call of calls) {
        const object = /data: (\w+)/.exec(call)?.[1] ?? "data";
        const after = source.slice(
          source.indexOf(call) + call.length,
          source.indexOf(call) + call.length + 200,
        );
        // Either it redirects, or it handles the null itself (`?.`, an explicit
        // branch). What it may not do is assume.
        const handled =
          new RegExp(`if \\(!${object}\\.user\\)`).test(after) ||
          new RegExp(`${object}\\.user\\?\\.`).test(source) ||
          new RegExp(`!${object}\\.user`).test(source);
        if (!handled) missing.push(`${f} :: ${call}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
