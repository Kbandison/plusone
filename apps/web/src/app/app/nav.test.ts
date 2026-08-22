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
    expect(items).toEqual(["/app", "/app/browse", "/app/inbox", "/app/rooms", "/app/profile"]);
  });

  /**
   * A connect and the chat it becomes are one thread (Decision #14 describes
   * one pipeline). Split across two entries, accepting made the row vanish from
   * one and reappear under the other with nothing on screen joining them.
   */
  it("folds chats into the inbox, and keeps the old route working", () => {
    const chatsIndex = readFileSync(join(import.meta.dirname, "chats/page.tsx"), "utf8");
    expect(chatsIndex).toMatch(/redirect\("\/app\/inbox"\)/);

    const inbox = readFileSync(join(import.meta.dirname, "inbox/page.tsx"), "utf8");
    // Connects and chats become one sorted list, not two sections.
    expect(inbox).toMatch(/from\("connects"\)/);
    expect(inbox).toMatch(/from\("chats"\)/);
    expect(inbox).toMatch(/inboxLogic\s*\.\s*sortThreads/);
  });

  /**
   * The clocks come from different columns and mean different things — a
   * connect expires because no interaction may end in silence (#14), a fuse
   * runs because a chat without a plan closes kindly (#13).
   *
   * An earlier version of this test demanded they be WORDED differently too.
   * That was wrong once the rows became a scannable list: both are "this ends
   * on a date", both are true said that way, and what actually distinguishes
   * them is the state beside the countdown — "Waiting on you" against "Your
   * turn". What must not happen is the two being read from the same place, or a
   * fuse counting on a chat that has already stopped.
   */
  it("takes the two countdowns from different columns", () => {
    const inbox = readFileSync(join(import.meta.dirname, "inbox/page.tsx"), "utf8");
    expect(inbox).toMatch(/deadlineAt: Date\.parse\(connect\.expires_at\)/);
    expect(inbox).toMatch(/chat\.status === "open" && chat\.fuse_expires_at/);
  });

  /** Decision #13 clears the fuse on a confirmed plan; a settled chat has none. */
  it("stops counting a fuse once the chat is not open", () => {
    const inbox = readFileSync(join(import.meta.dirname, "inbox/page.tsx"), "utf8");
    const deadline = inbox.slice(inbox.indexOf("The fuse only counts"));
    expect(deadline).toMatch(/chat\.status === "open"[\s\S]{0,120}: null/);
  });

  /**
   * Settings is the one entry that is not somewhere a member goes to do the
   * thing the app is for. Five of the others are people; this was the sixth
   * competing with them for a thumb.
   */
  it("puts settings in the header, with a real target and a name", () => {
    const header = LAYOUT.slice(LAYOUT.indexOf("<header"), LAYOUT.indexOf("</header>"));
    expect(header).toMatch(/href="\/app\/settings"/);
    expect(LAYOUT).toMatch(/aria-label=\{DRAFT_COPY\.app\.navSettings\}/);
    // A 21px icon is not a tap target; LAYOUT.minTapTarget is 44px.
    expect(LAYOUT).toMatch(/size-tap/);
  });

  /**
   * The bell shares that corner, and for the same reason settings does: it is a
   * record of what has already happened rather than somewhere to go and do
   * something, so it does not belong beside five people on the bottom bar.
   *
   * The count has to be in the accessible name. A badge is a coloured dot to
   * somebody not looking at it and nothing at all to somebody listening.
   */
  it("puts the notification list in the header too, and names the count", () => {
    const header = LAYOUT.slice(LAYOUT.indexOf("<header"), LAYOUT.indexOf("</header>"));
    expect(header).toMatch(/href="\/app\/notifications"/);
    expect(header).toMatch(/aria-label=\{DRAFT_COPY\.app\.notificationsBellLabel\(unread\)\}/);
    // Not a number on screen. §8 keeps count granularity out of a notification,
    // and a header is visible over somebody's shoulder.
    expect(header).not.toMatch(/\{unread\}/);
  });

  /**
   * INSERT only. Marking the list read is an UPDATE on the same table, so a
   * watch for everything would hear the notifications page's own bookkeeping
   * and refresh the screen the member is reading.
   */
  it("watches for arrivals without hearing itself", () => {
    expect(LAYOUT).toMatch(/table: "notifications"[\s\S]{0,80}event: "INSERT"/);
    expect(LAYOUT).toMatch(/filter: `user_id=eq\.\$\{data\.user\.id\}`/);
  });

  /** Moved, not removed — both screens still exist and are still reachable. */
  it("reaches invite and premium from Settings instead", () => {
    const settings = readFileSync(join(import.meta.dirname, "settings/page.tsx"), "utf8");
    expect(settings).toMatch(/href="\/app\/invite"/);

    // Premium is a tab of Settings now rather than a card linking out to a page
    // of its own, so the link lives in the bar the layout renders.
    const tabs = readFileSync(join(import.meta.dirname, "settings/settings-tabs.tsx"), "utf8");
    expect(tabs).toMatch(/href: "\/app\/settings\/premium"/);
    expect(tabs).toMatch(/href: "\/app\/settings"/);
  });

  it("wraps rather than overflowing, because the overflow is clipped", () => {
    // The clipping is real and is not going away — it is what stops horizontal
    // page scroll everywhere else. `clip` rather than `hidden` since
    // 20260820: hidden makes a scroll container, and setting it on body alone
    // propagated to the viewport and left body itself not clipping at all.
    expect(GLOBALS).toMatch(/overflow-x:\s*clip/);
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
