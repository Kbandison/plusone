import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const tabs = read("./room-tabs.tsx");
const layout = read("./layout.tsx");
const index = read("./page.tsx");
const room = read("./[roomId]/page.tsx");
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
  it("scrolls sideways rather than wrapping", () => {
    expect(tabs).toMatch(/overflow-x-auto/);
    expect(tabs).toMatch(/whitespace-nowrap/);
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

  it("makes opening a room the thing that marks it read", () => {
    expect(room).toMatch(/void supabase\.rpc\("mark_room_read"/);
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
