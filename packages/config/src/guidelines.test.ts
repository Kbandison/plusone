import { describe, expect, it } from "vitest";

import {
  BANNED_COPY_TERMS,
  BANNED_PRIVACY_CLAIMS,
  COMMUNITY_GUIDELINES,
  FAQ,
  GUIDELINES_INTRO,
} from "./index";

const guidelineText = [
  GUIDELINES_INTRO,
  ...COMMUNITY_GUIDELINES.flatMap((s) => [s.title, ...s.body, ...(s.list ?? [])]),
];
const faqText = FAQ.flatMap((e) => [e.question, ...e.answer]);
const allText = [...guidelineText, ...faqText];

describe("§3.2 voice", () => {
  // "The condition is context, not identity."
  it.each(BANNED_COPY_TERMS)("never says %s", (term) => {
    for (const text of allText) {
      expect(text.toLowerCase(), text.slice(0, 60)).not.toContain(term.toLowerCase());
    }
  });

  // §3.2 again: never "encrypted", "anonymous" or "guaranteed" unless literally
  // true. Neither of these documents has a literally-true use, so the rule here
  // is absolute.
  it.each(BANNED_PRIVACY_CLAIMS)("never claims %s", (claim) => {
    for (const text of allText) {
      expect(text.toLowerCase(), text.slice(0, 60)).not.toContain(claim.toLowerCase());
    }
  });

  // A page of medical basics on a dating app reads as talking down to the
  // people using it. Everyone here already knows.
  it("does not explain what anyone already lives with", () => {
    for (const text of allText) {
      expect(text.toLowerCase()).not.toMatch(/\b(?:transmission rates?|antiviral|viral load|cd4)\b/);
    }
  });
});

describe("the guidelines say what actually gets you removed", () => {
  it("names outing first among the removable things", () => {
    const section = COMMUNITY_GUIDELINES.find((s) => s.id === "what-gets-you-removed");
    expect(section?.list?.[0]).toMatch(/outing/i);
  });

  it("covers the things a report can be filed about", () => {
    const joined = guidelineText.join(" ").toLowerCase();
    for (const topic of ["harass", "under 18", "scam", "sexual"]) {
      expect(joined, topic).toContain(topic);
    }
  });

  it("says blocking needs no reason", () => {
    expect(guidelineText.join(" ")).toMatch(/needs no reason|no explanation/i);
  });
});

// The FAQ is where someone goes when deciding whether to trust this, which
// makes it the worst place to round up. Every claim below is checkable against
// a migration or a test.
describe("the FAQ matches what the product does", () => {
  const answer = (id: string) => FAQ.find((e) => e.id === id)?.answer.join(" ") ?? "";

  it("says three in the Drop, the same for everyone", () => {
    expect(answer("the-drop")).toMatch(/three/i);
    expect(answer("the-drop")).toMatch(/does not change if you pay|everyone gets three/i);
  });

  it("says seven days on the fuse, and that it cannot be bought", () => {
    expect(answer("the-fuse")).toMatch(/seven days/i);
    expect(answer("the-fuse")).toMatch(/cannot buy more time/i);
  });

  it("says the selfie is deleted, and no documents are asked for", () => {
    expect(answer("verification")).toMatch(/deleted as soon as/i);
    expect(answer("verification")).toMatch(/no documents/i);
  });

  it("says deletion is deletion, within seven days", () => {
    expect(answer("deleting")).toMatch(/seven days/i);
    expect(answer("deleting")).toMatch(/not a hidden account/i);
  });

  it("says leaving dating is instant and returning takes thirty days", () => {
    expect(answer("support-only")).toMatch(/instantly|instant/i);
    expect(answer("support-only")).toMatch(/thirty days/i);
  });

  it("says the blur happens before the photo is sent", () => {
    expect(answer("photos")).toMatch(/before it leaves our servers/i);
  });

  it("promises the free tier is a real app", () => {
    expect(answer("cost")).toMatch(/three connects a day/i);
    expect(answer("cost")).toMatch(/never buys/i);
  });

  it("gives every entry a unique id and an answer", () => {
    const ids = FAQ.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of FAQ) {
      expect(entry.answer.length, entry.id).toBeGreaterThan(0);
      expect(entry.question.endsWith("?"), entry.id).toBe(true);
    }
  });

  it("gives every guideline section a unique id and a body", () => {
    const ids = COMMUNITY_GUIDELINES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of COMMUNITY_GUIDELINES) {
      expect(section.body.length, section.id).toBeGreaterThan(0);
    }
  });
});
