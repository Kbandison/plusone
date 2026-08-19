import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const migration = read(
  "../../../../../../supabase/migrations/20260819000300_a_block_takes_the_thread_with_it.sql",
);
const settings = read("../settings/page.tsx");
const cron = read("../../api/cron/purge/route.ts");
const inbox = read("../inbox/page.tsx");

/**
 * A block removes the conversation. It does not destroy it.
 *
 * Blocking and reporting are two acts and the common order is block first,
 * report later. A thread deleted at block time is a report nobody can act on,
 * filed by the member least able to absorb being told that.
 */
describe("a block hides the thread", () => {
  it("stamps when, so retention has something to count from", () => {
    expect(migration).toMatch(/add column if not exists blocked_at timestamptz/);
    expect(migration).toMatch(/blocked_at = now\(\)/);
  });

  it("deletes nothing at the moment of blocking", () => {
    const trigger = migration.slice(
      migration.indexOf("create or replace function public.close_chats_on_block"),
      migration.indexOf("create or replace function public.may_read_chat"),
    );
    expect(trigger).not.toMatch(/delete from/);
  });

  /** Both policies, or the thread is hidden in one place and readable in another. */
  it("puts the rule on chats and on messages alike", () => {
    expect(migration).toMatch(/on public\.chats for select[\s\S]{0,120}may_read_chat/);
    expect(migration).toMatch(/on public\.messages for select[\s\S]{0,120}may_read_chat/);
  });

  /**
   * is_chat_participant still means what its name says and still guards writes.
   * Overloading it with "and is still allowed to see it" would make every
   * caller's meaning depend on a rule none of them mention.
   */
  it("leaves the participation predicate alone", () => {
    expect(migration).not.toMatch(/create or replace function public\.is_chat_participant/);
  });
});

describe("who keeps a copy", () => {
  /** Reporting is the act that says "I may need this again". */
  it("keeps it only for a participant who blocked AND reported", () => {
    const fn = migration.slice(
      migration.indexOf("create or replace function public.may_read_chat"),
    );
    const body = fn.slice(0, fn.indexOf("comment on function"));
    expect(body).toMatch(/from public\.blocks b/);
    expect(body).toMatch(/from public\.reports r/);
    expect(body).toMatch(/b\.blocker_id = p_user_id/);
    expect(body).toMatch(/r\.reporter_id = p_user_id/);
  });

  /** A preserved thread is somewhere to re-read what was said. */
  it("gives the blocked member nothing", () => {
    const fn = migration.slice(
      migration.indexOf("create or replace function public.may_read_chat"),
    );
    expect(fn.slice(0, fn.indexOf("comment on function"))).not.toMatch(/b\.blocked_id = p_user_id/);
  });

  it("reaches it from Settings, never from the inbox", () => {
    expect(settings).toMatch(/reportedThreadsHeading/);
    expect(settings).toMatch(/\.not\("blocked_at", "is", null\)/);
    expect(inbox).not.toMatch(/blocked_at/);
  });

  /** The wall decides; a second copy of the rule in TypeScript would drift. */
  it("does not re-implement the rule on the client", () => {
    const section = settings.slice(settings.indexOf("const { data: blockedChats }"));
    expect(section.slice(0, section.indexOf("</section>"))).not.toMatch(/reports|blocker_id/);
  });
});

describe("the purge", () => {
  it("runs off a config key rather than a literal", () => {
    expect(migration).toMatch(/config_int\('retention\.blocked_thread_days', 90\)/);
    expect(migration).toMatch(
      /insert into public\.app_config[\s\S]*retention\.blocked_thread_days/,
    );
  });

  /** A slow queue must not be able to destroy evidence it has not read. */
  it("is held by an open report, and by a recently resolved one", () => {
    const fn = migration.slice(migration.indexOf("returns table (chat_id uuid"));
    expect(fn).toMatch(/q\.status = 'open'/);
    expect(fn).toMatch(/q\.resolved_at is not null/);
    expect(fn).toMatch(/q\.resolved_at > now\(\) - make_interval\(days => v_days\)/);
  });

  /** The chat row is the record that a thread existed; the messages are not. */
  it("takes the messages and leaves the chat", () => {
    const fn = migration.slice(migration.indexOf("returns table (chat_id uuid"));
    expect(fn).toMatch(/delete from public\.messages m/);
    expect(fn).not.toMatch(/delete from public\.chats/);
  });

  /**
   * Storage cannot cascade. A voice note lives at
   * voice-notes/<chat_id>/<message_id> and the row holding that path is exactly
   * what the delete removes — the hard-delete route learned this one already.
   */
  it("hands back the voice notes so the bucket can be cleaned", () => {
    expect(migration).toMatch(/returns table \(chat_id uuid, voice_note_paths text\[\]\)/);
    expect(cron).toMatch(/sweep_purge_blocked_threads/);
    expect(cron).toMatch(/from\("voice-notes"\)\.remove\(paths\)/);
  });

  /** No ids, no bodies, no member — the count is the whole entry. */
  it("audits without naming anyone", () => {
    const audit = migration.slice(migration.indexOf("perform public.audit('retention"));
    expect(audit.slice(0, audit.indexOf(";"))).not.toMatch(/user|member|chat_id|body/);
  });

  it("is reachable by nobody but the service role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.sweep_purge_blocked_threads\(\) from public, anon, authenticated/,
    );
  });
});
