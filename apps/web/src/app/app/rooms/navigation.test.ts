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
