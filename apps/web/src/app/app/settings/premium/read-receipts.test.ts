import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PREMIUM_INCLUDES, PREMIUM_NEVER } from "@plusone/config";

const MIGRATIONS = new URL("../../../../../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(fileURLToPath(MIGRATIONS))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(fileURLToPath(new URL(f, MIGRATIONS)), "utf8"))
  .join("\n");

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/**
 * Prose stripped, for the reason incognito.test.ts records: a grant assertion
 * that reads a migration's own explanation of itself can be satisfied by
 * writing the right sentence, which is the opposite of what it is for.
 */
const code = sql.replace(/--[^\n]*/g, "");

describe("hiding is bought; being seen is the default", () => {
  const fn =
    /create or replace function public\.set_read_receipts_hidden[\s\S]*?\$\$;/.exec(code)?.[0] ??
    "";

  it("finds the function at all", () => {
    // The floor. Every assertion below is about the contents of this string.
    expect(fn.length).toBeGreaterThan(200);
  });

  it("gates only the HIDING direction", () => {
    // `p_hidden and not is_premium`. A bare `not is_premium` would trap a
    // lapsed member hidden with no way back — selling the exit rather than the
    // feature, which is the failure incognito.test.ts pins for the same reason.
    expect(fn).toMatch(/if\s+p_hidden\s+and\s+not\s+public\.is_premium/);
    expect(fn).not.toMatch(/if\s+not\s+public\.is_premium\s*\(/);
  });

  it("has nothing anywhere that resets the flag when premium ends", () => {
    // A lapse must never make a member MORE visible, and un-hiding somebody
    // because their card expired starts telling people when they read a
    // message, at a moment they were not present for.
    for (const match of code.matchAll(/set\s+hide_read_receipts\s*=\s*([a-z_.()]+)/g)) {
      expect(match[1], "something writes hide_read_receipts besides its function").toBe("p_hidden");
    }
  });

  it("offers un-hiding whatever the premium state", () => {
    const toggle = read("./read-receipts-toggle.tsx");
    // The button is disabled only in the direction that costs money.
    expect(toggle).toMatch(/disabled=\{pending \|\| \(!current && !canHide\)\}/);
  });
});

describe("the gate is the missing grant, not the action", () => {
  it("never grants update on the column", () => {
    // profiles carries no whole-table update grant — column-level only — so the
    // strongest available gate is to not grant this column at all. The opposite
    // of profile_photos, which needed a trigger precisely because it DOES carry
    // one. Read information_schema.role_table_grants, not the creating file.
    expect(code).not.toMatch(/grant[^;]*update\s*\(\s*hide_read_receipts\s*\)/);
    expect(code).toMatch(/revoke\s+update\s*\(\s*hide_read_receipts\s*\)/);
  });

  it("checks premium inside the database rather than only in the action", () => {
    const action = read("./read-receipts-actions.ts");
    // The action may check nothing at all and the gate still holds. What it must
    // NOT do is be the only place the check exists.
    expect(code).toMatch(/set_read_receipts_hidden[\s\S]*?is_premium/);
    expect(action).toMatch(/set_read_receipts_hidden/);
  });

  it("runs as definer, or the missing grant would stop the function too", () => {
    const fn =
      /create or replace function public\.set_read_receipts_hidden[\s\S]*?\$\$;/.exec(code)?.[0] ??
      "";
    expect(fn).toMatch(/security\s+definer/);
  });
});

describe("the receipt itself tells a caller nothing it should not", () => {
  const fn = /create or replace function public\.chat_read_at[\s\S]*?\$\$;/.exec(code)?.[0] ?? "";

  it("finds it", () => {
    expect(fn.length).toBeGreaterThan(100);
  });

  it("never returns your own marker", () => {
    // Otherwise a member reads their own last_read_at back and it renders as
    // the other person having seen it.
    expect(fn).toMatch(/user_id\s*<>\s*\(select auth\.uid\(\)\)/);
  });

  it("checks membership of the chat", () => {
    expect(fn).toMatch(/i_am_in_chat/);
  });

  it("returns null for a hidden member rather than a distinguishable error", () => {
    // Hidden, never-read, not-in-chat and nobody-else all come back null. A
    // caller that could tell them apart could probe for the flag.
    expect(fn).toMatch(/hide_read_receipts\s*=\s*false/);
  });
});

describe("it survives the deploy order, which nothing in the build can check", () => {
  it("reads the receipt in a request of its own", () => {
    // Migrations here are applied by hand, so code reaches production first.
    // PostgREST fails the WHOLE request on an unknown function, so folding this
    // into the message query would render the chat with no messages at all.
    const page = read("../../chats/[id]/page.tsx");
    expect(page).toMatch(/supabase\.rpc\("chat_read_at"/);
    // Not part of the messages select.
    const messagesQuery = /\.from\("messages"\)[\s\S]{0,400}?;/.exec(page)?.[0] ?? "";
    expect(messagesQuery.length).toBeGreaterThan(50);
    expect(messagesQuery).not.toMatch(/chat_read_at/);
  });

  it("reads the flag separately from incognito, though both are on profiles", () => {
    // They arrive in different migrations. One select for both means that
    // between the two deploys the pair fails together and BOTH switches read as
    // off — which silently un-hides somebody on a page telling them they are
    // hidden.
    const page = read("./page.tsx");
    expect(page).toMatch(/\.select\("incognito"\)/);
    expect(page).toMatch(/\.select\("hide_read_receipts"\)/);
  });
});

describe("it is sold as what the tier actually promises", () => {
  it("appears under who can see you, not as a new kind of thing", () => {
    const seen = PREMIUM_INCLUDES.find((g) => g.id === "seen");
    expect(seen?.items.some((i) => /read/i.test(i.title))).toBe(true);
  });

  it("does not sell anything on the never-list", () => {
    // "exemptions from closure notes" is the one this is adjacent to. Hiding a
    // receipt leaves the fuse and the closure note untouched, so nobody is
    // buying an exemption — but if a future change makes receipts load-bearing
    // for either, this stops being sellable and this test is where to argue.
    expect(PREMIUM_NEVER).toContain("exemptions from closure notes");
    const items = PREMIUM_INCLUDES.flatMap((g) => g.items.map((i) => `${i.title} ${i.body}`));
    for (const text of items) {
      expect(text.toLowerCase()).not.toMatch(/closure note|fuse|timer/);
    }
  });
});

describe("the receipt is live, and stops meaning anything once they reply", () => {
  const page = read("../../chats/[id]/page.tsx");
  const migrations = code;

  it("keys on the LAST message, not on my last message", () => {
    // Keyed on mine, the receipt survived their reply — "Read 01:41" pinned
    // under a conversation that had moved on. A reply is a stronger
    // acknowledgement than a receipt, so the receipt has nothing left to say.
    expect(page).toMatch(/const last = \(messages \?\? \[\]\)\.at\(-1\);/);
    expect(page).toMatch(/last\.sender_id !== me/);
    expect(page).not.toMatch(/reverse\(\)\.find\(\(m\) => m\.sender_id === me\)/);
  });

  it("marks read only when the marker is actually behind something", () => {
    // THE LOOP GUARD. The chat page calls mark_chat_read on every render, so
    // while it wrote unconditionally every render was an event and every event
    // a render. Watching chat_reads without this is an infinite loop, not a
    // slow page — which is why the condition is pinned rather than trusted.
    // The LAST definition wins, because there are two: the original
    // `create function` and 20260902000200's `create or replace`. Matching the
    // first would assert against the version this replaced — passing for ever
    // while the live one quietly lost its guard.
    const all = [
      ...migrations.matchAll(
        /create (?:or replace )?function public\.mark_chat_read[\s\S]*?\$\$;/g,
      ),
    ];
    expect(all.length).toBeGreaterThan(1);
    const fn = all[all.length - 1]![0];
    expect(fn.length).toBeGreaterThan(100);
    expect(fn).toMatch(/where[\s\S]*?last_read_at\s*<\s*\(/);
    expect(fn).toMatch(/max\(m\.created_at\)/);
  });

  it("lets a participant read the other marker, and only if it is not hidden", () => {
    // Realtime evaluates RLS per subscriber, so the widened SELECT policy is
    // what makes the event deliverable at all — and putting the hide flag in
    // the policy rather than only in chat_read_at() means Realtime honours it
    // too. A hidden member generates no event the other side may receive, so
    // there is nothing to filter client-side and nothing to leak.
    expect(migrations).toMatch(/create policy "read markers in your own chats"[\s\S]*?for select/);
    expect(migrations).toMatch(
      /create policy "read markers in your own chats"[\s\S]*?hide_read_receipts/,
    );
  });

  it("still refuses to let anybody write somebody else's marker", () => {
    // The difference between "you can see that I read it" and "you can decide
    // that I read it". Splitting one FOR ALL policy into three is exactly the
    // change that could widen writes by accident.
    expect(migrations).toMatch(
      /create policy "write only your own read marker"[\s\S]*?with check \(user_id = \(select auth\.uid\(\)\)/,
    );
    expect(migrations).toMatch(
      /create policy "move only your own read marker"[\s\S]*?using \(user_id = \(select auth\.uid\(\)\)/,
    );
  });

  it("is published, or none of the above delivers anything", () => {
    expect(migrations).toMatch(/alter publication supabase_realtime add table public\.chat_reads/);
  });
});
