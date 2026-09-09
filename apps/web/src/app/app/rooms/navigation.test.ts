import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

const feed = read("./[roomId]/page.tsx");
const thread = read("./[roomId]/[post]/page.tsx");
const modal = read("./[roomId]/@modal/(.)[post]/page.tsx");
const sql = read(
  "../../../../../../supabase/migrations/20260821000700_the_rest_of_it_arrives_too.sql",
);

/**
 * A post arriving without anybody pressing anything.
 *
 * The feed has done this since 20260821000700 and the THREAD never did — so the
 * one screen where two people are actually talking to each other was the one
 * that needed a manual reload. Both entry points are pinned, because a reply
 * appearing should not depend on how the thread was opened.
 */
describe("posts and replies arrive on their own", () => {
  it("rings the room on every insert, replies included", () => {
    // No `when` clause and no parent_id test: a reply is a room_message too, so
    // one trigger covers the feed and the thread.
    expect(sql).toMatch(
      /create trigger ring_room_on_message\s+after insert on public\.room_messages/,
    );
    expect(sql).toMatch(/set last_post_at = now\(\) where id = new\.room_id/);
  });

  it("watches that row from the feed, the thread and the modal", () => {
    for (const [name, src] of [
      ["feed", feed],
      ["thread", thread],
      ["modal", modal],
    ] as const) {
      expect(src, `${name} does not self-refresh`).toMatch(
        /<LiveRefresh\s+watch=\{\[\{ table: "rooms", filter: `id=eq\.\$\{roomId\}` \}\]\}\s*\/>/,
      );
    }
  });

  it("does not subscribe to room_messages directly", () => {
    // It would need the table published and a policy letting a member subscribe
    // to other people's rows, to learn something the room row already carries.
    for (const src of [feed, thread, modal]) {
      expect(src).not.toMatch(/table: "room_messages"/);
    }
  });
});

describe("the room page does not wait on itself", () => {
  const noComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
  const code = noComments(feed);

  it("blocks on auth and the room, and nothing else", () => {
    // `room` genuinely has to resolve first — the other four take its id. What
    // did not have to wait was the timezone read and the shareable-rooms list,
    // which sat either side of a Promise.all that already held two: three round
    // trips for one screen.
    //
    // after() blocks are excluded: mark_room_read and record_room_views run once
    // the response has been sent and cost the member nothing.
    const blocking = [...code.matchAll(/await\s+supabase\s*\.\s*(?:from|rpc|auth)/g)].filter(
      (m) => {
        const before = code.slice(0, m.index!);
        const opened = (before.match(/after\(async \(\) => \{/g) ?? []).length;
        const closed = (before.match(/^\s*\}\);$/gm) ?? []).length;
        return opened <= closed;
      },
    );
    expect(blocking.length).toBeLessThanOrEqual(2);
  });

  it("batches the four that only need ids", () => {
    expect(code).toMatch(
      /const \[\{ data: profile \}, \{ data: membership \}, \{ data: feed \}, \{ data: shareRoomRows \}\]/,
    );
    const batch = code.slice(code.indexOf("await Promise.all(["));
    const body = batch.slice(0, batch.indexOf("]);"));
    for (const q of ["profiles", "room_members", "room_feed", "rooms_i_can_share_into"]) {
      expect(body, `${q} left the batch`).toMatch(new RegExp(q));
    }
  });
});
