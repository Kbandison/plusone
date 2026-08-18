import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The bottom nav is the only navigation in the app, and it was unusable on a
 * phone.
 *
 * Nine labels in `justify-between` came to roughly 360px of text inside the
 * 312px a 360px screen leaves after the gutters, and `body { overflow-x:
 * hidden }` in globals.css meant the overflow was clipped rather than
 * scrollable — the last items were simply unreachable, and nothing said so,
 * because clipping never does.
 *
 * These assert the two properties that keep it usable rather than trying to
 * measure layout in a test runner: it wraps, and each link carries its own
 * padding so the target is not a bare 13px line box.
 */

const LAYOUT = readFileSync(join(import.meta.dirname, "layout.tsx"), "utf8");
const GLOBALS = readFileSync(join(import.meta.dirname, "../../styles/globals.css"), "utf8");

const LINKS = readFileSync(join(import.meta.dirname, "nav-links.tsx"), "utf8");

describe("the bottom nav", () => {
  /**
   * §7.4 names six sections: Home, Browse, Inbox, Chats, Rooms, and Profile &
   * Settings — and puts "referral screen w/ share sheet + counter" and
   * "subscription mgmt via Stripe portal" INSIDE the last of them.
   *
   * Invite and Premium had been promoted onto the bar, which made nine items on
   * something sized for a phone and gave the two screens a member opens least
   * the same weight as tonight's Drop. This asserted `>= 9`, so it held the
   * deviation in place rather than catching it.
   */
  it("carries the sections the spec names, and no more", () => {
    const items = [...LAYOUT.matchAll(/\{ href: "([^"]+)"/g)].map((m) => m[1]!);
    expect(items).toEqual([
      "/app",
      "/app/browse",
      "/app/inbox",
      "/app/chats",
      "/app/rooms",
      "/app/profile",
      "/app/settings",
    ]);
  });

  /** Moved, not removed — both screens still exist and are still reachable. */
  it("reaches invite and premium from Settings instead", () => {
    const settings = readFileSync(join(import.meta.dirname, "settings/page.tsx"), "utf8");
    expect(settings).toMatch(/href="\/app\/invite"/);
    expect(settings).toMatch(/href="\/app\/premium"/);
  });

  it("wraps rather than overflowing, because the overflow is clipped", () => {
    // The clipping is real and is not going away — it is what stops horizontal
    // page scroll everywhere else.
    expect(GLOBALS).toMatch(/overflow-x:\s*hidden/);
    const list = /<ul className="([^"]+)"/.exec(LAYOUT)?.[1] ?? "";
    expect(list, "the nav list must wrap").toMatch(/flex-wrap/);
  });

  it("gives each link its own padding, so the target is not a bare line box", () => {
    // WCAG 2.2 SC 2.5.8 wants 24x24 CSS px. Padding on the <ul> gives the links
    // none of it. The links live in nav-links.tsx now — a client component,
    // because the active state needs the pathname and the layout is a Server
    // Component.
    expect(LINKS, "no link className found — the nav shape changed").toMatch(/className=\{`/);
    expect(LINKS).toMatch(/min-h-tap/);
    expect(LINKS).toMatch(/px-\d/);
  });

  /**
   * All nine rendered with an identical class and no aria-current anywhere, so
   * nothing said which of the nine sections you were in — visually, or to a
   * screen reader listing the navigation.
   */
  it("marks the current section", () => {
    expect(LINKS).toMatch(/aria-current=\{current \? "page" : undefined\}/);
    expect(LINKS, "and shows it, not just announces it").toMatch(/border-accent/);
  });

  /**
   * /app is the parent of every other section, so a prefix test would light up
   * Home on every screen in the app.
   */
  it("does not treat /app as current on its own children", () => {
    expect(LINKS).toMatch(/item\.href === "\/app" \? pathname === "\/app"/);
  });
});
