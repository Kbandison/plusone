import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const noComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const layout = read("./layout.tsx");
const config = noComments(read("../../../next.config.ts"));

/**
 * What makes a tab feel like a reload rather than a navigation.
 *
 * Both properties here come from the Next 16 docs bundled in this repo, and
 * both are the kind that regress silently: nothing breaks, the app just gets
 * slower and nobody can say when.
 */
describe("every tab can show something before the server answers", () => {
  /** The five in the bottom bar, read from the nav rather than written twice. */
  const tabs = [...noComments(layout).matchAll(/\{ href: "(\/app[^"]*)"/g)].map((m) => m[1]!);

  it("finds all five", () => {
    expect(tabs.length).toBe(5);
  });

  it("gives each one a loading boundary", () => {
    // "Dynamic routes without loading.tsx" is the first cause the navigation
    // guide lists: without one the click BLOCKS until the server responds, and
    // with one the navigation happens immediately AND the route becomes
    // partially prefetchable.
    for (const href of tabs) {
      const segment = href === "/app" ? "." : `.${href.slice("/app".length)}`;
      expect(existsSync(here(`${segment}/loading.tsx`)), `${href} has no loading.tsx`).toBe(true);
    }
  });

  it("shapes each skeleton like its own page rather than reusing one", () => {
    // One shared skeleton for five tabs flashes something shaped like nothing
    // and then swaps, which reads as a reload even when the navigation is soft.
    // Cheap proxy for "shaped like it": they are not byte-identical.
    const bodies = tabs.map((href) => {
      const segment = href === "/app" ? "." : `.${href.slice("/app".length)}`;
      return noComments(read(`${segment}/loading.tsx`));
    });
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("announces itself once, not as a chattering live region", () => {
    for (const href of tabs) {
      const segment = href === "/app" ? "." : `.${href.slice("/app".length)}`;
      const body = read(`${segment}/loading.tsx`);
      expect(body, `${href}`).toMatch(/aria-busy="true"/);
      expect(body, `${href}`).toMatch(/role="status"/);
    }
  });
});

describe("returning to a tab does not refetch it from scratch", () => {
  it("sets a dynamic staleTime, because the default is zero", () => {
    // Not a tuning knob with a sensible default — `dynamic` ships at 0, "not
    // cached", and every page under /app is force-dynamic, so the default
    // applied to all of them.
    expect(config).toMatch(/staleTimes:\s*\{[\s\S]*?dynamic:\s*(\d+)/);
    const dynamic = Number(/dynamic:\s*(\d+)/.exec(config)?.[1] ?? 0);
    expect(dynamic).toBeGreaterThan(0);
  });

  it("keeps it short enough that nothing goes visibly stale", () => {
    // The surfaces that move push their own updates — inbox, chat, room and the
    // layout all mount LiveRefresh, and every action revalidates — so this only
    // ever covers Browse, the rooms list and a profile. Long enough to matter,
    // short enough not to be noticed.
    const dynamic = Number(/dynamic:\s*(\d+)/.exec(config)?.[1] ?? 0);
    expect(dynamic).toBeLessThanOrEqual(60);
  });

  it("still lets the moving surfaces refresh themselves", () => {
    // If LiveRefresh ever came off these, the staleTime above would start being
    // visible instead of invisible.
    for (const p of ["./inbox/page.tsx", "./chats/[id]/page.tsx", "./layout.tsx"]) {
      expect(read(p), `${p} no longer self-refreshes`).toMatch(/LiveRefresh/);
    }
  });
});
