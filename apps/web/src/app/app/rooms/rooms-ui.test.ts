import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const tabs = read("./room-tabs.tsx");
const layout = read("./layout.tsx");
const index = read("./page.tsx");
const room = read("./[roomId]/page.tsx");
// The row markup lives here now; the page composes it.
const row = read("./[roomId]/post-row.tsx");
const reads = read(
  "../../../../../../supabase/migrations/20260819000500_which_rooms_have_moved.sql",
);
const pin = read(
  "../../../../../../supabase/migrations/20260819000600_a_room_can_pin_something.sql",
);

/**
 * Rooms were a page of five identical cards you had to go back to in order to
 * reach any other one, so moving between them cost two navigations and the room
 * you were in was invisible from the room you were reading.
 */
describe("the rooms are a bar", () => {
  it("lives in a layout, so it survives navigation between rooms", () => {
    expect(layout).toMatch(/<RoomTabs rooms=\{rooms\}/);
    expect(layout).toMatch(/export default async function RoomsLayout/);
  });

  it("marks where you are, for the eye and for a reader", () => {
    expect(tabs).toMatch(/aria-current=\{current \? "page" : undefined\}/);
    expect(tabs).toMatch(/border-accent/);
  });

  /** Five rooms fit a laptop and not a phone; a bar that wraps is not a bar. */
  /**
   * The overflow, the hidden bar and the edge shadows all come from one
   * utility — see .scroll-shadows-x in globals.css. A scrollbar under a
   * five-item nav is either invisible or in the way on a phone, and neither
   * says there is more to the right.
   */
  it("scrolls sideways rather than wrapping, with no bar", () => {
    expect(tabs).toMatch(/scroll-shadows-x/);
    expect(tabs).toMatch(/whitespace-nowrap/);

    const css = read("../../../styles/globals.css");
    expect(css).toMatch(/\.scroll-shadows-x \{[\s\S]*?scrollbar-width: none;/);
    expect(css).toMatch(/\.scroll-shadows-x::-webkit-scrollbar \{\s*display: none;/);
  });

  /**
   * Two covers attached `local` and two shadows attached `scroll`. At rest a
   * cover sits over its shadow and hides it; scrolling moves the cover off and
   * reveals it. Nothing computes that — it falls out of the two attachment
   * modes disagreeing, which is why there is no listener and no observer.
   */
  it("shows an edge shadow only where there is more", () => {
    const css = read("../../../styles/globals.css");
    const rule = css.slice(css.indexOf(".scroll-shadows-x {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/no-repeat\s+local/);
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/no-repeat\s+scroll/);
  });

  it("names itself in the navigation landmark", () => {
    expect(tabs).toMatch(/<nav aria-label=\{C\.roomsHeading\}/);
  });

  /** The index has nothing of its own left to show. */
  it("sends /app/rooms into the first room in scope", () => {
    expect(index).toMatch(/redirect\(`\/app\/rooms\/\$\{first\.id as string\}`\)/);
  });

  /** Not reachable today, but a community with no rooms is a configuration. */
  it("still has something to render when there are none", () => {
    expect(index).toMatch(/C\.roomsEmpty/);
  });
});

describe("a tab says whether anything has happened", () => {
  it("asks once for every room rather than once per room", () => {
    expect(layout).toMatch(/supabase\.rpc\("room_activity"\)/);
    expect(layout).toMatch(/Promise\.all/);
  });

  /**
   * A number invites a member to clear it, and a support room is not an inbox
   * to get to zero — Decision #26 rules out mechanics that make people feel
   * behind.
   */
  it("is a dot, not a count", () => {
    expect(tabs).toMatch(/rounded-full bg-accent/);
    expect(tabs).not.toMatch(/\{room\.unreadCount\}|count\}/);
  });

  it("says so to a reader that cannot see the dot", () => {
    expect(tabs).toMatch(/<span className="sr-only"> — \{C\.roomUnread\}<\/span>/);
  });

  /** A marker arguing with the page under it. */
  it("shows nothing on the room you are reading", () => {
    expect(tabs).toMatch(/room\.unread && !current/);
  });

  /**
   * That the call HAPPENS, not how it is written. This asserted
   * `void supabase.rpc("mark_room_read"` — which is the exact idiom that never
   * sent the request, so the test held the bug in place and passed while the
   * feature did nothing.
   */
  it("makes opening a room the thing that marks it read", () => {
    expect(room).toMatch(/supabase\.rpc\("mark_room_read"/);
    const code = room
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");
    expect(code).not.toMatch(/void supabase\.rpc/);
  });

  /**
   * SECURITY INVOKER, so the room_messages policy decides what counts — a room
   * whose only new post is from somebody you blocked has nothing new in it.
   */
  it("counts activity through the same walls the room screens read", () => {
    expect(reads).toMatch(/security invoker/);
    expect(reads).toMatch(/create function public\.room_activity/);
  });

  /** Every new object in this schema needs this line. */
  it("revokes the default grants Supabase hands out", () => {
    expect(reads).toMatch(/revoke all on public\.room_reads from anon, authenticated/);
  });

  /** Either test alone leaks — see the policy's own note. */
  it("keeps a read marker private to its owner and their own room", () => {
    expect(reads).toMatch(/user_id = \(select auth\.uid\(\)\) and public\.i_am_in_room\(room_id\)/);
  });
});

describe("a room can pin something", () => {
  /** §5.2 put the column there; nothing could ever write to it. */
  it("has a write path at last, admin only and audited", () => {
    expect(pin).toMatch(/if not public\.is_admin\(\) then/);
    expect(pin).toMatch(/perform public\.audit\('room\.pinned_card_set'/);
    expect(pin).toMatch(/'was', v_old/);
  });

  /** A card with no title renders as an empty box. */
  it("refuses a card that would render as nothing", () => {
    expect(pin).toMatch(/a pinned card needs a title and a body/);
  });

  /** A javascript: URL in a field that becomes an href is somebody's script. */
  it("takes https and nothing else", () => {
    expect(pin).toMatch(/!~ '\^https:\/\/'/);
  });

  /**
   * Without noreferrer the destination learns that whoever arrived came from a
   * room in this product — which undoes §8's reasoning on the one screen where
   * a member is most likely to click out.
   */
  it("sends no referrer with the link", () => {
    expect(room).toMatch(/rel="noopener noreferrer"/);
  });

  it("falls back to the URL when no label is given", () => {
    expect(room).toMatch(/\{pinned\.urlLabel \?\? pinned\.url\}/);
  });
});

const menu = read("../overflow-menu.tsx");

/**
 * A feed, not a stack of objects.
 *
 * The posts were bordered rounded cards with gaps between them, which reads as
 * a list of things rather than as one continuous surface. Every feed converges
 * on full-bleed rows ruled off from each other for the same reason.
 */
describe("the room reads as a feed", () => {
  it("rules the rows off instead of boxing each one", () => {
    expect(room).toMatch(/<ul className="-mx-6 mt-6 border-t border-line">/);
    expect(room).toMatch(/border-b border-line px-6 py-4/);
    const feed = room.slice(room.indexOf('<ul className="-mx-6'));
    expect(feed, "a row must not be a card").not.toMatch(/rounded-lg border border-line px/);
  });

  /** Edge to edge is the whole difference in feel on a phone. */
  it("bleeds the rules past the page gutter", () => {
    expect(room).toMatch(/-mx-6 mt-6 border-t/);
  });

  it("gives each row the age of the post", () => {
    expect(row).toMatch(/chatLogic\.compactAge\(postedAt, now, zone\)/);
    expect(row).toMatch(/dateTime=\{new Date\(postedAt\)\.toISOString\(\)\}/);
    expect(row).toMatch(/title=\{chatLogic\.messageTimeExact\(postedAt, zone\)\}/);
  });

  /** One reading of the clock for the page, not one per row. */
  it("reads the clock once", () => {
    expect(room).toMatch(/const now = Date\.now\(\);/);
    expect(room.match(/Date\.now\(\)/g)).toHaveLength(1);
  });

  /**
   * The composer above the feed. Below a hundred rows of scrolling it made the
   * room read as something to consume rather than somewhere to speak.
   */
  it("puts the composer above the posts", () => {
    expect(room.indexOf("<RoomCompose")).toBeLessThan(room.indexOf('<ul className="-mx-6'));
  });

  /** Report and block on every row was two text links per post. */
  it("folds the per-post controls behind one press", () => {
    expect(row).toMatch(/<OverflowMenu label=\{C\.postMenuLabel\} compact>/);
    expect(row).toMatch(/<ReportControl roomMessageId=/);
  });

  /**
   * Rooms WERE unattributed by construction, and this asserted that. It is now
   * a choice a member makes per post — so the rule that replaces it is not "no
   * author" but "no author the member did not agree to": the name comes from
   * room_feed, which returns an alias and a null id unless they chose
   * otherwise, and never from a column the client could have read itself.
   */
  it("takes every name from the projection, never from the table", () => {
    expect(row).toMatch(/post\.author_name/);
    expect(row).not.toMatch(/display_name/);
    expect(room).not.toMatch(/\.from\("room_messages"\)/);
  });
});

/**
 * Two callers now, which is why it stopped being ChatMenu — the chat header and
 * every post in a room. Two copies of the outside-press and Escape handling
 * would be two things to get right.
 */
describe("one overflow menu", () => {
  it("takes its label from the caller", () => {
    expect(menu).toMatch(/label = C\.chatMenuLabel/);
    expect(menu).toMatch(/aria-label=\{label\}/);
    expect(menu).toMatch(/aria-haspopup="menu"/);
  });

  /** LAYOUT.minTapTarget is a floor; a feed is the surface used most in a hurry. */
  it("keeps a full tap target even when compact", () => {
    expect(menu).toMatch(/size-tap/);
    expect(menu).toMatch(/compact \? "-mr-2\.5 scale-90" : ""/);
  });

  it("still closes on an outside press and on Escape", () => {
    expect(menu).toMatch(/pointerdown/);
    expect(menu).toMatch(/event\.key === "Escape"/);
  });
});
