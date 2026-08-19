import { describe, expect, it } from "vitest";

import { groupThreads, isUnread, needsYou, sortThreads, stateOf, toThread } from "./inbox";
import type { ThreadInput, ThreadState } from "./types";

const base: ThreadInput = { id: "t", kind: "chat", startedByMe: false, updatedAt: 1_000 };
const at = (n: number) => n;

/**
 * A pending connect and the chat it becomes are one thread (Decision #14
 * describes one pipeline). The member asks one question of every row — "is this
 * mine to do?" — and answering it differently per stage is what put them on two
 * screens in the first place.
 */
describe("what a thread is waiting on", () => {
  it("puts an incoming connect on the member", () => {
    expect(stateOf({ ...base, kind: "connect", startedByMe: false })).toBe(
      "awaiting_your_decision",
    );
  });

  it("puts one they sent on the other person", () => {
    expect(stateOf({ ...base, kind: "connect", startedByMe: true })).toBe(
      "awaiting_their_decision",
    );
  });

  it("follows the last word in an open chat", () => {
    expect(
      stateOf({ ...base, chatStatus: "open", lastMessageAt: at(5), lastMessageFromMe: false }),
    ).toBe("awaiting_your_reply");
    expect(
      stateOf({ ...base, chatStatus: "open", lastMessageAt: at(5), lastMessageFromMe: true }),
    ).toBe("awaiting_their_reply");
  });

  it("knows a chat nobody has spoken in yet", () => {
    expect(stateOf({ ...base, chatStatus: "open", lastMessageAt: null })).toBe("no_messages");
  });

  /**
   * A closed chat, or one with a plan in it, is owed nothing: the fuse has
   * stopped and there is no reply anybody is waiting for. Decision #13 clears
   * the fuse on a confirmed plan, so a date_planned chat must not keep
   * demanding a reply.
   */
  it("treats anything but an open chat as settled", () => {
    for (const chatStatus of [
      "date_planned",
      "closed_fuse",
      "closed_by_member",
      "graduated",
    ] as const) {
      expect(stateOf({ ...base, chatStatus, lastMessageAt: at(5), lastMessageFromMe: false })).toBe(
        "settled",
      );
    }
  });
});

describe("what counts as unread", () => {
  it("is their message arriving after you last looked", () => {
    expect(
      isUnread({ ...base, lastMessageAt: at(10), lastMessageFromMe: false, lastReadAt: at(5) }),
    ).toBe(true);
  });

  it("is not your own message, however new", () => {
    expect(
      isUnread({ ...base, lastMessageAt: at(10), lastMessageFromMe: true, lastReadAt: at(5) }),
    ).toBe(false);
  });

  it("is nothing at all in an empty chat", () => {
    expect(isUnread({ ...base, lastMessageAt: null })).toBe(false);
  });

  /** A chat that opened while you were away has never been looked at. */
  it("counts a thread you have never opened", () => {
    expect(
      isUnread({ ...base, lastMessageAt: at(10), lastMessageFromMe: false, lastReadAt: null }),
    ).toBe(true);
  });

  it("stops once you have looked", () => {
    expect(
      isUnread({ ...base, lastMessageAt: at(10), lastMessageFromMe: false, lastReadAt: at(20) }),
    ).toBe(false);
  });

  /**
   * Read and still owed is the ordinary state of a thread you are thinking
   * about. Collapsing the two would mean opening a message counted as answering
   * it.
   */
  it("is separate from owing a reply", () => {
    const read = toThread({
      ...base,
      chatStatus: "open",
      lastMessageAt: at(10),
      lastMessageFromMe: false,
      lastReadAt: at(20),
    });
    expect(read.unread).toBe(false);
    expect(needsYou(read)).toBe(true);
  });
});

/**
 * The inbox answers "what needs me" before "what happened lately". A decision
 * somebody is waiting on outranks a chat that is merely recent.
 */
describe("the order things appear in", () => {
  const make = (id: string, input: Partial<ThreadInput>) =>
    toThread({ ...base, id, ...input } as ThreadInput);

  it("puts what the member owes above what is merely new", () => {
    const recentButTheirs = make("recent", {
      chatStatus: "open",
      lastMessageAt: at(9_000),
      lastMessageFromMe: true,
      updatedAt: 9_000,
    });
    const oldDecision = make("decide", { kind: "connect", startedByMe: false, updatedAt: 1 });

    const [first] = sortThreads([recentButTheirs, oldDecision]);
    expect(first?.id).toBe("decide");
  });

  it("puts a decision above a reply", () => {
    const reply = make("reply", {
      chatStatus: "open",
      lastMessageAt: at(9_000),
      lastMessageFromMe: false,
      updatedAt: 9_000,
    });
    const decision = make("decide", { kind: "connect", startedByMe: false, updatedAt: 1 });
    expect(sortThreads([reply, decision]).map((t) => t.id)).toEqual(["decide", "reply"]);
  });

  it("sorts settled threads last, however recent", () => {
    const closed = make("closed", { chatStatus: "closed_fuse", updatedAt: 9_999 });
    const waiting = make("waiting", { kind: "connect", startedByMe: true, updatedAt: 1 });
    expect(sortThreads([closed, waiting]).map((t) => t.id)).toEqual(["waiting", "closed"]);
  });

  it("breaks a tie with unread, then with recency", () => {
    const older = make("older", {
      chatStatus: "open",
      lastMessageAt: at(100),
      lastMessageFromMe: false,
      lastReadAt: null,
      updatedAt: 100,
    });
    const newer = make("newer", {
      chatStatus: "open",
      lastMessageAt: at(200),
      lastMessageFromMe: false,
      lastReadAt: at(300),
      updatedAt: 200,
    });
    expect(sortThreads([newer, older]).map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("does not mutate what it is given", () => {
    const list = [make("a", { updatedAt: 1 }), make("b", { updatedAt: 2 })];
    const copy = [...list];
    sortThreads(list);
    expect(list).toEqual(copy);
  });
});

describe("groupThreads", () => {
  const of = (...states: ThreadState[]) => states.map((state, i) => ({ id: `${i}`, state }));

  it("separates a conversation from an ask nobody has answered", () => {
    const g = groupThreads(of("awaiting_your_reply", "awaiting_their_decision"));
    expect(g.chats.map((t) => t.state)).toEqual(["awaiting_your_reply"]);
    expect(g.sent.map((t) => t.state)).toEqual(["awaiting_their_decision"]);
  });

  /** A chat with nothing said in it is still a chat you can walk into. */
  it("counts an empty chat as a conversation", () => {
    expect(groupThreads(of("no_messages")).chats).toHaveLength(1);
  });

  it("keeps the decision queue its own thing", () => {
    const g = groupThreads(of("awaiting_your_decision"));
    expect(g.decisions).toHaveLength(1);
    expect(g.chats).toHaveLength(0);
    expect(g.sent).toHaveLength(0);
  });

  /** A closed chat is not a task, and a column of them pushes the live ones off. */
  it("lifts endings out of the list", () => {
    const g = groupThreads(of("settled", "awaiting_your_reply", "settled"));
    expect(g.settled).toHaveLength(2);
    expect(g.chats).toHaveLength(1);
  });

  /** Every state lands somewhere, or a thread silently disappears from the page. */
  it("loses nothing", () => {
    const all: ThreadState[] = [
      "awaiting_your_decision",
      "awaiting_their_decision",
      "awaiting_your_reply",
      "awaiting_their_reply",
      "no_messages",
      "settled",
    ];
    const g = groupThreads(of(...all));
    expect(g.decisions.length + g.chats.length + g.sent.length + g.settled.length).toBe(all.length);
  });

  it("keeps the order it was given", () => {
    const g = groupThreads([
      { id: "b", state: "awaiting_your_reply" as const },
      { id: "a", state: "awaiting_their_reply" as const },
    ]);
    expect(g.chats.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
