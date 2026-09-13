import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const noComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const layout = read("./layout.tsx");
const config = noComments(read("../../../next.config.ts"));

/**
 * What makes a tab feel like a reload rather than a navigation.
 *
 * Both properties here come from the Next 16 docs bundled in this repo, and
 * both are the kind that regress silently: nothing breaks, the app just gets
 * slower and nobody can say when.
 */
describe("every tab can show something before the server answers", () => {
  /** The five in the bottom bar, read from the nav rather than written twice. */
  const tabs = [...noComments(layout).matchAll(/\{ href: "(\/app[^"]*)"/g)].map((m) => m[1]!);

  it("finds all five", () => {
    expect(tabs.length).toBe(5);
  });

  it("gives each one a loading boundary", () => {
    // "Dynamic routes without loading.tsx" is the first cause the navigation
    // guide lists: without one the click BLOCKS until the server responds, and
    // with one the navigation happens immediately AND the route becomes
    // partially prefetchable.
    for (const href of tabs) {
      const segment = href === "/app" ? "." : `.${href.slice("/app".length)}`;
      expect(existsSync(here(`${segment}/loading.tsx`)), `${href} has no loading.tsx`).toBe(true);
    }
  });

  it("shapes each skeleton like its own page rather than reusing one", () => {
    // One shared skeleton for five tabs flashes something shaped like nothing
    // and then swaps, which reads as a reload even when the navigation is soft.
    // Cheap proxy for "shaped like it": they are not byte-identical.
    const bodies = tabs.map((href) => {
      const segment = href === "/app" ? "." : `.${href.slice("/app".length)}`;
      return noComments(read(`${segment}/loading.tsx`));
    });
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("announces itself once, not as a chattering live region", () => {
    for (const href of tabs) {
      const segment = href === "/app" ? "." : `.${href.slice("/app".length)}`;
      const body = read(`${segment}/loading.tsx`);
      expect(body, `${href}`).toMatch(/aria-busy="true"/);
      expect(body, `${href}`).toMatch(/role="status"/);
    }
  });
});

describe("returning to a tab does not refetch it from scratch", () => {
  it("sets a dynamic staleTime, because the default is zero", () => {
    // Not a tuning knob with a sensible default — `dynamic` ships at 0, "not
    // cached", and every page under /app is force-dynamic, so the default
    // applied to all of them.
    expect(config).toMatch(/staleTimes:\s*\{[\s\S]*?dynamic:\s*(\d+)/);
    const dynamic = Number(/dynamic:\s*(\d+)/.exec(config)?.[1] ?? 0);
    expect(dynamic).toBeGreaterThan(0);
  });

  it("keeps it short enough that nothing goes visibly stale", () => {
    // The surfaces that move push their own updates — inbox, chat, room and the
    // layout all mount LiveRefresh, and every action revalidates — so this only
    // ever covers Browse, the rooms list and a profile. Long enough to matter,
    // short enough not to be noticed.
    const dynamic = Number(/dynamic:\s*(\d+)/.exec(config)?.[1] ?? 0);
    expect(dynamic).toBeLessThanOrEqual(60);
  });

  it("still lets the moving surfaces refresh themselves", () => {
    // If LiveRefresh ever came off these, the staleTime above would start being
    // visible instead of invisible.
    for (const p of ["./inbox/page.tsx", "./chats/[id]/page.tsx", "./layout.tsx"]) {
      expect(read(p), `${p} no longer self-refreshes`).toMatch(/LiveRefresh/);
    }
  });
});

/**
 * The nav badges: unread messages, and replies to your own posts.
 *
 * Two counts and two decisions. Kevin chose total unread MESSAGES over threads
 * ("16" says how much is waiting, "3" says how many people are), and replies to
 * his OWN posts over all room activity — the second being the consequential one.
 * Counting unread room posts would have read 118 the day it shipped, because
 * Latest news holds 117 articles against 1 reply: a number the news cron sets
 * rather than a person, and one that never reaches zero. §3.3 forbids the app
 * nudging somebody back for general activity.
 */
describe("the nav counts", () => {
  // 20260912000100, not 20260911000200. That file created the function as
  // `security invoker` and it could not run at all — see below. This is where
  // the contract lives now.
  const sql = read(
    "../../../../../supabase/migrations/20260912000100_the_nav_counts_need_their_own_walls.sql",
  ).replace(/^\s*--.*$/gm, "");
  const nav = read("./nav-links.tsx");
  const layout = read("./layout.tsx");

  it("is a definer, because authorship is not the member's to read", () => {
    // This asserted the OPPOSITE until 2026-09-12, and the invoker version could
    // not run at all: "permission denied for table room_messages".
    //
    // Two reasons. `count(*)` needs table-level SELECT and authenticated has
    // only column-level — which is why room_activity gets away with invoker,
    // since it selects max(created_at) and never counts rows. And `user_id` is
    // NOT among the granted columns, because a room post may be anonymous. So
    // "replies to MY posts" cannot be expressed as the member at any cost.
    expect(sql).toMatch(/security definer/);
    expect(sql).not.toMatch(/security invoker/);
  });

  it("counts a granted column, never count(*)", () => {
    expect(sql).not.toMatch(/count\(\*\)/);
    expect(sql).toMatch(/count\(m\.id\)/);
    expect(sql).toMatch(/count\(reply\.id\)/);
  });

  it("writes out the walls a definer does not inherit", () => {
    // A definer does not see RLS, so every restriction the invoker version would
    // have got free has to be stated. Without these the count spans the whole
    // database — measured: 8 across everyone's chats against 3 truly the
    // member's.
    expect(sql).toMatch(/public\.i_am_in_chat\(m\.chat_id\)/);
    expect(sql).toMatch(/from public\.room_members rmem/);
  });

  it("counts an unopened chat as entirely unread", () => {
    // A chat never opened has NO chat_reads row. An inner join scores it zero,
    // which is the opposite of the truth — and it is the case the badge most
    // exists for. Measured live: all 5 of one member's unread messages were in
    // chats with no read row at all, so an inner join would have shown nothing.
    expect(sql).toMatch(/left join public\.chat_reads/);
    expect(sql).toMatch(/left join public\.room_reads/);
    expect(sql.match(/last_read_at is null or/g)?.length).toBe(2);
  });

  it("never counts the member's own messages or replies", () => {
    expect(sql).toMatch(/m\.sender_id is distinct from \(select auth\.uid\(\)\)/);
    expect(sql).toMatch(/reply\.user_id is distinct from \(select auth\.uid\(\)\)/);
  });

  it("never counts something that was taken back", () => {
    // Unsend redacts through deleted_at. A withdrawn message is not waiting.
    expect(sql).toMatch(/m\.deleted_at is null/);
    expect(sql).toMatch(/reply\.deleted_at is null/);
    expect(sql).toMatch(/post\.deleted_at is null/);
  });

  it("counts replies under the member's OWN posts only", () => {
    // The whole point. Without this it is room activity, and Latest news wins.
    expect(sql).toMatch(/post\.user_id = \(select auth\.uid\(\)\)/);
    expect(sql).toMatch(/join public\.room_messages post on post\.id = reply\.parent_id/);
  });

  it("draws nothing at zero", () => {
    // The COMPONENT decides, not the caller. That keeps the tab's children
    // unconditional, which nav.test.ts separately requires — a conditional in a
    // tab is how one ended up unnamed after a refactor nobody looked at.
    const ui = read("../ui.tsx");
    expect(ui).toMatch(/if \(n < 1\) return null;/);
    expect(nav).toMatch(/<CountBadge count=\{count\} \/>/);
  });

  it("puts the number in the accessible name, not only on the icon", () => {
    // The icons are aria-hidden, so a badge drawn and not named is a nav that
    // tells a sighted member something it withholds from everybody else.
    expect(nav).toMatch(
      /aria-label=\{count > 0 \? C\.navUnread\(item\.label, count\) : item\.label\}/,
    );
    expect(read("../ui.tsx")).toMatch(/aria-hidden="true"/);
  });

  it("positions the badge against the icon, not the row", () => {
    // On a flex-1 tab the row's corner is a long way from the mark, and further
    // on a tablet than a phone because the tabs grow and the icon does not.
    expect(nav).toMatch(/<span className="relative flex">/);
    expect(read("../ui.tsx")).toMatch(/absolute -top-1 -right-2/);
  });

  it("caps the number, so it stays a count and not a shape", () => {
    expect(read("../ui.tsx")).toMatch(/n > max \? `\$\{max\}\+` : n/);
  });

  it("survives the migration not being applied yet", () => {
    // Code reaches production before the schema here as a matter of course, and
    // PostgREST fails the WHOLE request on an unknown function — which in this
    // layout would take the header, the nav and the bell down with it.
    // Whitespace-insensitive: prettier wraps the two-argument .then across
    // three lines, and the first version of this asserted the one-line form.
    const compact = layout.replace(/\s+/g, " ");
    expect(compact).toMatch(
      /rpc\("my_nav_counts"\)\.then\( \(r\) => r, \(\) => \(\{ data: null \}\)/,
    );
  });
});

/**
 * An unread reply clears a thread at a time, not a room at a time.
 *
 * The first version measured against `room_reads.last_read_at`, which is per
 * ROOM — so opening any post in Disclosure stories cleared every unread reply
 * in it, including replies to posts never opened. Kevin: "that would bother
 * me." The badge said one thing and clearing it required nothing to do with the
 * thing it counted.
 */
describe("a reply is read when its thread is", () => {
  const sql = read(
    "../../../../../supabase/migrations/20260912000300_a_reply_is_read_when_the_thread_is.sql",
  ).replace(/^\s*--.*$/gm, "");
  const thread = read("./rooms/[roomId]/thread.tsx");

  /**
   * The BODY of my_nav_counts, not the file from that point on.
   *
   * `comment on function` describes the choice in a string literal — "room_reads
   * is deliberately not consulted" — which survives stripping `--` lines and
   * satisfies a negative match for the very thing it says is absent. Fifth time
   * this week that prose in a file has answered for the code in it.
   */
  const countsBody = (() => {
    const at = sql.indexOf("create or replace function public.my_nav_counts");
    expect(at).toBeGreaterThan(-1);
    const open = sql.indexOf("as $$", at);
    return sql.slice(open, sql.indexOf("$$;", open));
  })();

  it("measures a reply against its own thread", () => {
    const counts = countsBody;
    expect(counts).toMatch(/left join public\.thread_reads tr/);
    expect(counts).toMatch(/coalesce\(tr\.last_read_at, '-infinity'::timestamptz\)/);
  });

  it("NEVER consults room_reads for a reply", () => {
    // The regression, and the whole point. rooms/[roomId]/page.tsx calls
    // mark_room_read when the room opens, so reading it here lets opening the
    // ROOM clear a reply the member never saw. My first attempt kept it as a
    // fallback for members who had read a room before this existed, and it
    // reintroduced the bug by a different route — caught by testing the four
    // cases rather than only the one being fixed.
    expect(countsBody).not.toMatch(/room_reads/);
  });

  it("copies the old room markers once, so nothing comes back unread", () => {
    // History is handled by a BACKFILL rather than a fallback: a member who had
    // read a room is treated as having read their own threads in it as of then.
    // THE WHOLE STATEMENT, not three substrings. Neutering the backfill —
    // appending `select null … where false` after the insert line — left all
    // three fragments in place and this passed. A shape is what needs asserting
    // when the sabotage can keep the words.
    expect(sql).toMatch(
      /insert into public\.thread_reads \(root_id, user_id, last_read_at\)\s*\n\s*select post\.id, rd\.user_id, rd\.last_read_at\s*\n\s*from public\.room_messages post\s*\n\s*join public\.room_reads rd/,
    );
    // Only the member's OWN root posts, which is all the count ever looks at.
    expect(sql).toMatch(/rd\.user_id = post\.user_id/);
    expect(sql).toMatch(/where post\.parent_id is null/);
  });

  it("advances on every open, unlike the view recorder", () => {
    // record_room_views is `on conflict do nothing` — right for a first-seen
    // count and useless as a read marker, because a reply arriving after the
    // first view would stay unread for ever.
    expect(sql).toMatch(/on conflict \(root_id, user_id\) do update set last_read_at = now\(\)/);
  });

  it("marks the thread read when the thread renders", () => {
    // Beside record_room_views, not instead of it: the FEED writes the view too,
    // and scrolling past a post must not clear a reply the member never saw.
    expect(thread).toMatch(/rpc\("mark_thread_read", \{ p_root_id: root\.id \}\)/);
    expect(thread).toMatch(/rpc\("record_room_views"/);
  });

  it("closes the new table the way every other one is closed", () => {
    // Supabase grants every role everything on a new object in this schema.
    expect(sql).toMatch(/alter table public\.thread_reads enable row level security/);
    expect(sql).toMatch(/create policy "own thread markers in your own rooms"/);
    expect(sql).toMatch(/revoke all on public\.thread_reads from anon, authenticated/);
    expect(sql).toMatch(/grant select, insert, update on public\.thread_reads to authenticated/);
  });
});
