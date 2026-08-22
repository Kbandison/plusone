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

const live = withoutComments(read("./live-chat.tsx"));
const page = withoutComments(read("./page.tsx"));
const sql = read("../../../../../../../supabase/migrations/20260821000600_a_chat_that_arrives.sql");

/**
 * A chat you have to reload is not a chat. Everything here is server rendered,
 * correct on load and then frozen.
 */
describe("a message arrives without being asked for", () => {
  it("touches the chat row when a message lands", () => {
    expect(sql).toMatch(/update public\.chats set updated_at = now\(\) where id = new\.chat_id/);
    expect(sql).toMatch(/after insert on public\.messages/);
  });

  /**
   * The client is told THAT the chat changed and nothing else, then refetches
   * through the page — which is a normal server render with the member's own
   * session, so may_read_chat, the block wall and every column grant apply
   * exactly as on a cold load, because it IS a cold load.
   */
  it("refetches rather than rendering what it was sent", () => {
    expect(live).toMatch(/router\.refresh\(\)/);
    // Nothing is read off the event at all.
    expect(live).not.toMatch(/payload\.|\.new\b|setMessages|useState/);
  });

  /**
   * Not `messages`: the words people said to each other have no reason to
   * travel a second time over a different channel with a different
   * authorisation path. `chats` carries a status, a fuse and a plan — all
   * things a participant already reads on the page — and no message text.
   */
  it("streams the chat row and never the messages", () => {
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.chats/);
    expect(sql).not.toMatch(/add table public\.messages/);
    expect(live).toMatch(/table: "chats"/);
  });

  /**
   * Without the filter every participant of every chat is woken by every other
   * chat they are in, and refetches a page they are not looking at.
   */
  it("filters to the one chat, server-side", () => {
    expect(live).toMatch(/filter: `id=eq\.\$\{chatId\}`/);
  });

  /**
   * Realtime evaluates RLS with the JWT it is given. Without the access token
   * it authorises `anon`, who is a participant in nothing, and every event is
   * silently withheld.
   */
  it("hands Realtime the member's own token", () => {
    expect(live).toMatch(/supabase\.realtime\.setAuth\(token\)/);
    expect(live).toMatch(/getSession\(\)/);
  });

  /** Two messages a second apart are one refetch, not two. */
  it("coalesces a burst", () => {
    expect(live).toMatch(/window\.clearTimeout\(timer\)/);
    expect(live).toMatch(/setTimeout\(\(\) => router\.refresh\(\), 120\)/);
  });

  it("unsubscribes when the screen goes", () => {
    expect(live).toMatch(/supabase\.removeChannel\(channel\)/);
    expect(live).toMatch(/cancelled = true/);
  });

  it("is mounted on the thread", () => {
    expect(page).toMatch(/<LiveChat chatId=\{id\} \/>/);
  });

  /**
   * The first attempt used realtime.send() on a private channel — better on
   * paper, and it silently did nothing: realtime.messages is partitioned by
   * day, this project has zero partitions, and realtime.send catches its own
   * failure and turns it into a WARNING nobody reads. Broadcast is not built on
   * here, and the migration says why so nobody re-tries it.
   */
  it("records why it is not a broadcast", () => {
    expect(sql).toMatch(/no partition of relation "messages" found/);
    expect(sql).toMatch(/drop policy if exists "participants may listen to their own chat"/);
  });

  /** Members hold SELECT on chats and nothing else, so nobody can fake a ring. */
  it("cannot be rung by a member", () => {
    expect(sql).toMatch(
      /revoke all on function public\.ring_chat\(\) from public, anon, authenticated/,
    );
  });
});
