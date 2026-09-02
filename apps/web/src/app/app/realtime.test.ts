import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
    .join("\n");

const live = withoutComments(read("./live-refresh.tsx"));
const chat = withoutComments(read("./chats/[id]/page.tsx"));
const room = withoutComments(read("./rooms/[roomId]/page.tsx"));
const inbox = withoutComments(read("./inbox/page.tsx"));
const M = "../../../../../supabase/migrations/";
const chatSql = read(`${M}20260821000600_a_chat_that_arrives.sql`);
const restSql = read(`${M}20260821000700_the_rest_of_it_arrives_too.sql`);

/**
 * A doorbell, not a delivery.
 *
 * Every wall in this schema is three layers deep — policies, column grants, and
 * security-definer functions — and the things the app renders come from
 * FUNCTIONS rather than rows. room_feed() does the anonymity redaction;
 * visible_profiles does the block wall. Realtime can honour the first two
 * layers and cannot reproduce the third, so it is never asked to.
 */
describe("realtime carries nothing and re-reads everything", () => {
  it("ignores the payload entirely", () => {
    expect(live).toMatch(/router\.refresh\(\)/);
    expect(live).not.toMatch(/payload|\.new\b|\.old\b|setState|useState/);
  });

  it("coalesces a burst into one refetch", () => {
    expect(live).toMatch(/window\.clearTimeout\(timer\)/);
    expect(live).toMatch(/setTimeout\(\(\) => router\.refresh\(\), 120\)/);
  });

  /**
   * Realtime evaluates RLS with the JWT it is given. Without the token it
   * authorises `anon`, who is in no chat and no community, and every event is
   * silently withheld — which looks exactly like a feature that does not work.
   */
  it("hands Realtime the member's own token", () => {
    expect(live).toMatch(/supabase\.realtime\.setAuth\(token\)/);
  });

  /** A channel is a websocket; three for one screen is three heartbeats. */
  it("uses one channel however many tables it watches", () => {
    expect(live).toMatch(/let joining = supabase\.channel\(/);
    expect(live).toMatch(/for \(const target of targets\)/);
  });

  it("unsubscribes when the screen goes", () => {
    expect(live).toMatch(/supabase\.removeChannel\(channel\)/);
  });

  /** An inline array literal in a parent must not re-subscribe every render. */
  it("does not resubscribe on every parent render", () => {
    expect(live).toMatch(/const key = JSON\.stringify\(watch\)/);
    expect(live).toMatch(/\}, \[key, router\]\)/);
  });
});

/**
 * Adding a table to the publication puts its rows on the replication stream, so
 * the list is a privacy decision rather than a performance one.
 */
describe("what is allowed on the wire", () => {
  it("streams the rows that are already readable, and no message text", () => {
    expect(chatSql).toMatch(/add table public\.chats/);
    expect(restSql).toMatch(/add table public\.rooms/);
    expect(restSql).toMatch(/add table public\.connects/);
  });

  /**
   * room_messages.user_id is REVOKED from members because an anonymous post
   * must not be traceable, and the feed's redaction is done by a function. A
   * row on a socket cannot reproduce a function, so no row goes on the socket.
   */
  it("never streams the messages or the room posts", () => {
    for (const sql of [chatSql, restSql]) {
      expect(sql).not.toMatch(/add table public\.messages/);
      expect(sql).not.toMatch(/add table public\.room_messages/);
    }
  });

  /** Only the trigger rings; members hold no update on any of these rows. */
  it("cannot be rung by a member", () => {
    expect(chatSql).toMatch(
      /revoke all on function public\.ring_chat\(\) from public, anon, authenticated/,
    );
    expect(restSql).toMatch(
      /revoke all on function public\.ring_room\(\) from public, anon, authenticated/,
    );
  });

  /**
   * Likes and views fire constantly, change a number nobody is waiting on, and
   * would wake every member of a room for each one. Realtime is for things that
   * arrive, not for things that tick.
   */
  it("leaves the counters alone", () => {
    for (const sql of [chatSql, restSql]) {
      expect(sql).not.toMatch(
        /add table public\.room_message_likes|add table public\.room_message_views/,
      );
    }
  });
});

describe("each screen watches the right thing", () => {
  it("the chat watches its own row", () => {
    // Both watches are FILTERED to this chat. Without a filter every member of
    // every chat is woken by every other chat they are in — the property this
    // asserts, and the reason it survives chat_reads being added beside chats.
    expect(chat).toMatch(/\{ table: "chats", filter: `id=eq\.\$\{id\}` \}/);
    expect(chat).toMatch(/\{ table: "chat_reads", filter: `chat_id=eq\.\$\{id\}` \}/);
    expect(chatSql).toMatch(
      /update public\.chats set updated_at = now\(\) where id = new\.chat_id/,
    );
  });

  /** Replies are room_messages too, so one trigger covers feed and thread. */
  it("the room watches its own row, and a reply rings it", () => {
    expect(room).toMatch(/watch=\{\[\{ table: "rooms", filter: `id=eq\.\$\{roomId\}` \}\]\}/);
    expect(restSql).toMatch(
      /update public\.rooms set last_post_at = now\(\) where id = new\.room_id/,
    );
    expect(restSql).toMatch(/after insert on public\.room_messages/);
  });

  /**
   * The inbox is two lists. A connect can arrive or be answered, and a chat can
   * gain a message or close — chats has no member column to filter on, but
   * "participants read their chats" already means "mine" and Realtime evaluates
   * it per subscriber. RLS is the filter.
   */
  it("the inbox watches both ends of a connect, and its chats", () => {
    expect(inbox).toMatch(/table: "connects", filter: `initiator_id=eq\.\$\{me\}`/);
    expect(inbox).toMatch(/table: "connects", filter: `target_id=eq\.\$\{me\}`/);
    expect(inbox).toMatch(/\{ table: "chats" \}/);
  });
});

/**
 * The first attempt used realtime.send() on a private channel — better on
 * paper, and it silently did nothing: realtime.messages is partitioned by day,
 * this project has zero partitions, and realtime.send catches its own failure
 * and turns it into a WARNING nobody reads.
 */
describe("why this is not a broadcast", () => {
  it("records the reason where the next person will look", () => {
    expect(chatSql).toMatch(/no partition of relation "messages" found/);
    expect(chatSql).toMatch(/drop policy if exists "participants may listen to their own chat"/);
  });
});
