import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

/**
 * A segment with a layout and no page is a 404 wearing navigation.
 *
 * /admin had exactly that: six sections listed across the top of a layout, and
 * the URL holding them led nowhere. The Settings link I added pointed straight
 * at it. Nothing caught it — the route compiled, the layout compiled, and the
 * only thing missing was the one file that makes a segment a place.
 */
describe("every linked route is somewhere you can arrive", () => {
  /**
   * Walks the app directory for internal hrefs and checks each one resolves to
   * a page. Cheap, and it is the check that would have caught this.
   */
  function pagesUnder(dir: string, prefix = ""): Set<string> {
    const found = new Set<string>();
    for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
      if (entry.name === "page.tsx") found.add(prefix || "/");
      if (!entry.isDirectory()) continue;
      // Route groups and parallel/private segments do not appear in the URL.
      if (entry.name.startsWith("_")) continue;
      const segment = /^[(@]/.test(entry.name) ? "" : `/${entry.name}`;
      for (const nested of pagesUnder(`${dir}/${entry.name}`, `${prefix}${segment}`)) {
        found.add(nested);
      }
    }
    return found;
  }

  const pages = pagesUnder(".");

  it("finds the routes at all", () => {
    // A silent zero would make every assertion below vacuous.
    expect(pages.size).toBeGreaterThan(20);
  });

  it("has a page at /admin, not just a layout over one", () => {
    expect(pages.has("/admin")).toBe(true);
    expect(existsSync(join(APP, "admin/page.tsx"))).toBe(true);
  });

  /** Every section the admin nav lists. */
  it("has a page behind every admin tab", () => {
    const layout = read("admin/layout.tsx");
    const linked = [...layout.matchAll(/href: "(\/admin[^"]*)"/g)].map((m) => m[1]!);
    expect(linked.length).toBeGreaterThan(4);
    for (const href of linked) expect(pages, href).toContain(href);
  });

  /**
   * The link in Settings, which is the only way into /admin from inside the
   * app — and which pointed at a 404 for one commit.
   */
  it("has a page behind the link that gets you there", () => {
    const settings = read("app/settings/page.tsx");
    const href = /href="(\/admin[^"]*)"/.exec(settings)?.[1];
    expect(href).toBeTruthy();
    expect(pages).toContain(href!);
  });
});

/**
 * A count query written separately from the list it counts is a second
 * definition of "open", and the two disagree the first time either changes.
 */
describe("the front door counts what the sections show", () => {
  const home = read("admin/page.tsx");

  it("calls the same RPCs the sections call", () => {
    expect(home).toMatch(/rpc\("admin_open_reports"\)/);
    expect(home).toMatch(/rpc\("admin_flagged_verifications"\)/);
    expect(read("admin/reports/page.tsx")).toMatch(/rpc\("admin_open_reports"\)/);
    expect(read("admin/verifications/page.tsx")).toMatch(/rpc\("admin_flagged_verifications"\)/);
  });

  /** A failed count must not render as a confident zero. */
  it("shows a failure rather than a zero", () => {
    expect(home).toMatch(/queue\.error \?/);
  });
});
