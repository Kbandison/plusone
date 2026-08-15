import { describe, expect, it } from "vitest";

import { CLOSURE_TEMPLATES, CONNECTS, PROFILE_PROMPTS } from "@plusone/config";

import { lineLength, checkTone, isAcceptableClosureLine } from "./index";

// §3.5's closure notes are read by someone being turned down. A parting shot
// about their status is the cruellest thing this product could carry, and the
// one thing a blocklist can reliably catch.
describe("a closure line may not mention a condition", () => {
  it.each([
    "honestly the hsv thing was too much for me",
    "I can't do HIV sorry",
    "the herpes was a dealbreaker",
    "you said undetectable but still",
    "not into STDs",
    "are you clean though",
    "I only date negative people",
    "the outbreaks scared me",
    "cold sores are a no",
    "your diagnosis is a lot",
    "poz guys aren't my type",
    "felt dirty after",
  ])("catches %s", (line) => {
    expect(checkTone(line).violations).toContain("condition_reference");
    expect(isAcceptableClosureLine(line)).toBe(false);
  });

  // A false positive costs one rewrite; a false negative cannot be unread. But
  // the bar still has to leave ordinary sentences alone.
  it.each([
    "I really enjoyed talking to you, just not feeling a spark",
    "the timing isn't right for me",
    "you seem lovely — I'm not in the right place",
    "I met someone else, wishing you well",
    "we want different things I think",
    "I'm going to step back for now",
  ])("leaves an ordinary line alone: %s", (line) => {
    expect(checkTone(line)).toEqual({ ok: true, violations: [] });
  });

  it("does not fire on words that merely contain one", () => {
    for (const line of [
      "I responded positively to the whole thing",
      "the shiv reference was odd",
    ]) {
      expect(checkTone(line).violations).not.toContain("condition_reference");
    }
  });

  it("clears every spec closure template", () => {
    for (const template of CLOSURE_TEMPLATES) {
      expect(checkTone(template), template).toEqual({ ok: true, violations: [] });
    }
  });
});

describe("contact information", () => {
  it.each([
    "email me at sam@example.com",
    "text me 555 123 4567",
    "+1 (555) 123-4567",
    "here's my insta @samsamsam",
    "find me on snapchat",
    "https://example.com/sam",
    "www.example.com",
  ])("catches %s", (line) => {
    expect(checkTone(line).violations).toContain("contact_info");
  });

  it("does not fire on an ordinary number", () => {
    expect(checkTone("I'll be there at 7").violations).not.toContain("contact_info");
  });
});

describe("sexual content and insults", () => {
  it.each(["send nudes", "feeling horny", "dtf?", "nsa only"])("catches %s", (line) => {
    expect(checkTone(line).violations).toContain("sexual_content");
  });

  it.each(["you're ugly", "what a loser", "that was disgusting", "waste of time"])(
    "catches %s",
    (line) => {
      expect(checkTone(line).violations).toContain("insult");
    },
  );
});

describe("length", () => {
  it("allows exactly the configured maximum", () => {
    const line = "a".repeat(CONNECTS.personalLineMaxChars);
    expect(checkTone(line).violations).not.toContain("too_long");
  });

  it("rejects one character more", () => {
    const line = "a".repeat(CONNECTS.personalLineMaxChars + 1);
    expect(checkTone(line).violations).toContain("too_long");
  });

  it("measures the trimmed line", () => {
    const line = `  ${"a".repeat(CONNECTS.personalLineMaxChars)}  `;
    expect(checkTone(line).violations).not.toContain("too_long");
  });
});

describe("reporting", () => {
  // Sending someone round the loop three times to be told three things is a
  // worse experience than the rule it is enforcing.
  it("returns every violation at once", () => {
    const result = checkTone("you're disgusting, hsv is gross, text me 5551234567");
    expect(result.violations).toEqual(
      expect.arrayContaining(["contact_info", "condition_reference", "insult"]),
    );
    expect(result.ok).toBe(false);
  });

  it("passes an empty line", () => {
    expect(checkTone("")).toEqual({ ok: true, violations: [] });
  });

  it("is deterministic", () => {
    const line = "not feeling it, sorry";
    expect(checkTone(line)).toEqual(checkTone(line));
  });
});

// Decision #14 — a connect is a reply to a prompt, so every member reads these.
// Asserted here rather than in packages/config, which cannot import this
// module: config is the leaf and logic depends on it, not the other way round.
describe("profile prompts meet the same bar", () => {
  // A prompt that fishes for a diagnosis story would undo the point of the
  // place.
  it.each(PROFILE_PROMPTS)("$question", (prompt) => {
    expect(checkTone(prompt.question)).toEqual({ ok: true, violations: [] });
  });

  it("never asks about anyone's status", () => {
    for (const prompt of PROFILE_PROMPTS) {
      expect(checkTone(prompt.question).violations).not.toContain("condition_reference");
    }
  });
});

describe("condition words in a room", () => {
  // The rooms are the one surface whose purpose is this subject. Applying the
  // notification rule to them made "Newly diagnosed" refuse "diagnosed".
  const ROOM = { maxChars: 2000, allowConditionWords: true } as const;

  it.each([
    "I was diagnosed with HSV-2 last month and I'm scared.",
    "Anyone else newly diagnosed?",
    "U=U changed everything for me.",
    "Undetectable since March.",
    "First outbreak was the worst week of my life.",
    "My status is not the most interesting thing about me.",
  ])("lets a member say %j in a room", (line) => {
    expect(checkTone(line, ROOM)).toEqual({ ok: true, violations: [] });
  });

  it("still refuses the same line in a closure note", () => {
    const line = "Anyone else newly diagnosed?";
    expect(checkTone(line).violations).toContain("condition_reference");
  });

  it("opts out of one rule, not out of moderation", () => {
    expect(checkTone("you are disgusting", ROOM).violations).toContain("insult");
    expect(checkTone("hit me on instagram", ROOM).violations).toContain("contact_info");
    expect(checkTone("send nudes", ROOM).violations).toContain("sexual_content");
    expect(checkTone("a".repeat(2001), ROOM).violations).toContain("too_long");
  });
});

describe("one way to measure a line", () => {
  // checkTone measured the trimmed string and fuse's close measured the raw
  // one, so the app told a member their closing note was fine and then refused
  // to send it.
  const LIMIT = 140;

  it("ignores surrounding whitespace, in both directions", () => {
    expect(lineLength(`${"a".repeat(LIMIT)} `)).toBe(LIMIT);
    expect(lineLength(`  ${"a".repeat(LIMIT)}\n`)).toBe(LIMIT);
    expect(checkTone(`${"a".repeat(LIMIT)} `).ok).toBe(true);
    expect(checkTone(`${"a".repeat(LIMIT + 1)}`).violations).toContain("too_long");
  });

  it("counts characters, not UTF-16 code units", () => {
    // Eighty emoji is eighty characters and 160 units. Anyone writing outside
    // the BMP was silently given half the length everyone else gets.
    const eighty = "🙂".repeat(80);
    expect(eighty.length).toBe(160);
    expect(lineLength(eighty)).toBe(80);
    expect(checkTone(eighty).violations).not.toContain("too_long");
  });

  it("agrees with the fuse on the same line", () => {
    for (const line of [
      "a".repeat(LIMIT),
      `${"a".repeat(LIMIT)} `,
      "a".repeat(LIMIT + 1),
      "🙂".repeat(80),
      "🙂".repeat(141),
    ]) {
      const toneSaysTooLong = checkTone(line).violations.includes("too_long");
      const fuseSaysTooLong = lineLength(line) > LIMIT;
      expect(fuseSaysTooLong, JSON.stringify(line.slice(0, 12))).toBe(toneSaysTooLong);
    }
  });
});
