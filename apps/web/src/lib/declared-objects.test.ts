import { describe, expect, it } from "vitest";

import { droppedIn, finalState } from "../../../../scripts/declared-objects.mjs";

/**
 * The collector `check:db` and the ledger backfill both read migrations
 * through.
 *
 * It had a silent bug: a policy dropped in a LATER file was never discounted,
 * so `check:db` reported it absent from the live schema for ever. Silent
 * because every earlier `drop policy` in this repo recreates the same name in
 * the same breath — the create puts the key back and the failed delete costs
 * nothing. 20260902000200 is the first that drops one name and creates three
 * different ones.
 */
describe("a policy dropped by a later migration stops being declared", () => {
  it("keys a dropped policy by its table, as the accumulators do", () => {
    // The whole bug in one line: it returned "p" where every consumer stores
    // "t.p", so `.delete()` matched nothing.
    const gone = droppedIn(`drop policy if exists "own read markers" on public.chat_reads;`);
    expect([...gone.policies]).toEqual(["chat_reads.own read markers"]);
  });

  it("handles the unquoted-schema form too", () => {
    const gone = droppedIn(`drop policy "p" on chat_reads;`);
    expect([...gone.policies]).toEqual(["chat_reads.p"]);
  });

  it("does not discount a policy that is dropped and recreated", () => {
    // The ordinary way to change a policy, and it must still count as declared.
    const state = finalState();
    expect(state.policies.size).toBeGreaterThan(20);
  });

  it("no longer declares the policy 20260902000200 replaced", () => {
    // The real case, against the real migrations. 20260819000100 created
    // "own read markers in your own chats"; 20260902000200 dropped it and put
    // three narrower ones in its place, because only SELECT should widen.
    const state = finalState();
    expect(state.policies.has("chat_reads.own read markers in your own chats")).toBe(false);
    for (const name of [
      "read markers in your own chats",
      "write only your own read marker",
      "move only your own read marker",
    ]) {
      expect(state.policies.has(`chat_reads.${name}`), `${name} should be declared`).toBe(true);
    }
  });
});
