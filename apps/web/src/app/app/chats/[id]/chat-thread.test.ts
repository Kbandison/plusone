import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("./page.tsx");
const forms = read("./chat-forms.tsx");
const times = read("./show-times.tsx");
const browse = read("../../browse/page.tsx");
const drop = read("../../../../lib/drop.ts");

/**
 * A connect IS a prompt and a reply (Decision #14) — no name, no photo, you
 * decide on what somebody wrote. Accepting one opened a chat headed "Say the
 * first thing" over "Nobody has written yet", which was false: something had
 * been written, it was the whole basis of the match, and the chat threw it away
 * at the moment it stopped being a decision and became a conversation.
 */
describe("the chat opens on what was actually said", () => {
  it("reads the prompt and reply off the connect", () => {
    expect(page).toMatch(/\.select\("initiator_id, target_id, prompt_id, prompt_reply"\)/);
  });

  it("renders them above the thread", () => {
    expect(page).toMatch(/promptQuestion\(connect\.prompt_id as string\)/);
    expect(page).toMatch(/connect\.prompt_reply as string/);
    expect(page.indexOf("prompt_reply as string")).toBeLessThan(page.indexOf("<ShowTimes>"));
  });

  /** A blockquote and its caption, not two loose paragraphs. */
  it("marks it up as the quotation it is", () => {
    expect(page).toMatch(/<figure/);
    expect(page).toMatch(/<figcaption/);
    expect(page).toMatch(/<blockquote/);
  });
});

describe("every bubble carries its time", () => {
  it("renders a real time element with a machine-readable value", () => {
    expect(page).toMatch(/<time\s+dateTime=\{new Date\(sentAt\)\.toISOString\(\)\}/);
    expect(page).toMatch(/title=\{chatLogic\.messageTimeExact\(sentAt, zone\)\}/);
  });

  /**
   * Hidden from the eye, never from the reader. Making it aria-hidden when
   * collapsed would take the time away from the one member who cannot see the
   * layout, which is the wrong half to keep.
   */
  it("keeps it in the markup when it is not shown", () => {
    expect(page).toMatch(/className="sr-only group-data-\[times=on\]:not-sr-only/);
    expect(page).not.toMatch(/<time[^>]*aria-hidden/);
  });

  /**
   * One toggle, not a press per bubble. Making each bubble a button put fifty
   * tab stops in a conversation and took the text out of a plain selection.
   */
  it("toggles the whole thread at once", () => {
    expect(times).toMatch(/aria-pressed=\{on\}/);
    expect(times).toMatch(/data-times=\{on \? "on" : "off"\}/);
    expect(page).not.toMatch(/<li[^>]*onClick/);
  });

  /** The viewer's clock, and one reading of it for the whole page. */
  it("formats in the member's own timezone", () => {
    expect(page).toMatch(/const zone = \(profile\?\.timezone as string \| null\) \?\? "UTC"/);
    expect(page).toMatch(/\.select\("display_name, timezone"\)/);
    expect(page).toMatch(/const now = Date\.now\(\)/);
  });

  it("breaks the run when the day changes", () => {
    expect(page).toMatch(/chatLogic\.needsDateSeparator\(previous, sentAt, zone\)/);
    expect(page).toMatch(/chatLogic\.dateSeparatorLabel\(sentAt, now, zone\)/);
  });
});

describe("an unsent line survives leaving the screen", () => {
  it("keeps the draft on the device and nowhere else", () => {
    expect(forms).toMatch(/window\.localStorage\.setItem\(draftKey\(chatId\), body\)/);
    expect(forms).toMatch(/plusone:draft:\$\{chatId\}/);
  });

  /**
   * CHAT_INITIAL is also {error: null}, so "no error" is true on mount — a
   * clear keyed on that alone would throw away the draft it had just restored,
   * every time the screen opened.
   */
  it("clears only after a send that actually happened", () => {
    expect(forms).toMatch(/if \(pending\) sent\.current = true;/);
    expect(forms).toMatch(/else if \(sent\.current && state\.error === null\)/);
  });

  it("does not clear on submit, when the action can still fail", () => {
    const composer = forms.slice(forms.indexOf("export function Composer"));
    expect(composer.slice(0, composer.indexOf("</form>"))).not.toMatch(/onSubmit/);
  });
});

/**
 * isEligible has always refused a candidate you have connected with — and never
 * ran again, because a stored Drop is replayed from served_profile_ids rather
 * than rebuilt. So sending a connect left the card there for the rest of the
 * day, offering to do the thing you had just done.
 */
describe("the Drop forgets who you have already reached", () => {
  it("filters the stored ids before rendering them", () => {
    expect(drop).toMatch(/withoutConnected\(userId, existing\.served_profile_ids as string\[\]\)/);
  });

  /** The row is the record of what was served; times_served counts off it. */
  it("does not rewrite the stored drop", () => {
    const replay = drop.slice(
      drop.indexOf("if (existing) {"),
      drop.indexOf("const { data: rows }"),
    );
    expect(replay).not.toMatch(/\.update\(|\.upsert\(|\.insert\(/);
  });

  it("asks once for the whole set rather than once per card", () => {
    const start = drop.indexOf("async function withoutConnected");
    const helper = drop.slice(start, drop.indexOf("export async function getTonightsDrop", start));
    expect(helper.match(/await supabase/g) ?? []).toHaveLength(1);
  });
});

describe("Browse remembers who you have spoken to", () => {
  it("labels a row from the connect behind it", () => {
    expect(browse).toMatch(/connectsLogic\.historyWith\(/);
    expect(browse).toMatch(/HISTORY_LABEL\[history\.get\(row\.id as string\)!\]/);
  });

  /** A live connect outranks a finished one when there are several. */
  it("prefers the current state over an old one", () => {
    expect(browse).toMatch(/if \(state !== "past" \|\| !history\.has\(them\)\) history\.set/);
  });

  /** Two spellings of one fact are two things to keep true. */
  it("reuses the inbox wording for the pending states", () => {
    expect(browse).toMatch(/waiting_on_you: C\.threadNeedsDecision/);
    expect(browse).toMatch(/waiting_on_them: C\.threadSentWaiting/);
  });

  it("never puts a decline on a card", () => {
    expect(browse).not.toMatch(/declined/);
  });
});
