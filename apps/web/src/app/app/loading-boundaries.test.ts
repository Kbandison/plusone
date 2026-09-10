import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = fileURLToPath(new URL(".", import.meta.url));

/** Every directory holding a page.tsx, relative to /app. */
function routes(dir = APP, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (!statSync(abs).isDirectory()) continue;
    out.push(...routes(abs, rel ? `${rel}/${entry}` : entry));
  }
  if (readdirSync(dir).includes("page.tsx")) out.push(rel);
  return out;
}

const has = (rel: string, file: string) => {
  try {
    return readdirSync(join(APP, rel)).includes(file);
  } catch {
    return false;
  }
};

/** The nearest loading.tsx at or above a route, "" meaning the app root's. */
function boundary(rel: string): string {
  let cur = rel;
  for (;;) {
    if (has(cur, "loading.tsx")) return cur;
    if (cur === "") return "";
    cur = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/")) : "";
  }
}

/**
 * A parallel slot streams independently and takes its own loading state.
 *
 * Next's parallel-routes reference: "Parallel Routes can be streamed
 * independently, allowing you to define independent error and loading states
 * for each route." The nearest boundary ABOVE a slot sits above every sibling
 * slot too — so without one of its own, opening a sheet replaces the page
 * BEHIND the sheet instead of filling it. That is what made opening a post feel
 * like a tap that had been ignored: three sequential round trips with nothing
 * on screen in front of them.
 */
describe("every intercepting slot has its own loading state", () => {
  const slots = routes().filter((r) => r.split("/").some((seg) => seg.startsWith("@")));

  it("finds the slots, so a rename does not empty this test", () => {
    // The floor. Without it, changing the @modal convention makes every
    // assertion below vacuously true and this file reports success forever.
    expect(slots.length).toBeGreaterThanOrEqual(3);
  });

  it.each(slots)("%s", (slot) => {
    expect(boundary(slot)).toBe(slot);
  });
});

/**
 * A screen you open from another screen needs a boundary at its own depth.
 *
 * These are the routes reached by tapping a row — a post, a chat, a profile —
 * where the parent tab is already on screen and only the deeper segment is
 * being fetched. An ancestor boundary would blank the parent as well.
 */
describe("the screens you open from a list", () => {
  const OPENED = ["rooms/[roomId]", "rooms/[roomId]/[post]", "chats/[id]", "connect/[id]"];

  it.each(OPENED)("%s has a boundary at its own depth", (route) => {
    expect(routes()).toContain(route);
    expect(boundary(route)).toBe(route);
  });
});

/**
 * `loading.tsx` nests INSIDE `layout.tsx` in the same segment, so anything the
 * layout renders is already on screen and must not be drawn again.
 */
describe("a skeleton draws only what its own segment owns", () => {
  it("rooms/loading.tsx does not draw a second tab strip", () => {
    // RoomTabs is in rooms/layout.tsx and has already rendered. This file drew
    // its own strip until 2026-09-09, which read as the screen rebuilding.
    const loading = readFile("rooms/loading.tsx");
    expect(loading).not.toMatch(/gap-1 py-2/);
    const tabs = readFile("rooms/room-tabs.tsx");
    expect(tabs).toMatch(/-mx-6 border-b border-line px-6/);
  });

  it("the room feed skeleton does not draw one either", () => {
    expect(readFile("rooms/[roomId]/loading.tsx")).not.toMatch(/border-b border-line px-6/);
  });
});

function readFile(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}
