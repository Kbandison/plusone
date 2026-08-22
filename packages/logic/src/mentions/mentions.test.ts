import { describe, expect, it } from "vitest";

import { mentionPrefix, mentionSpans, parseMentions } from "./mentions";

describe("finding who a message is addressing", () => {
  it("reads the tag the Reply button writes", () => {
    expect(parseMentions("@Cedar thanks, that helps")).toContain("Cedar");
  });

  it("finds one anywhere in a sentence, not only at the front", () => {
    expect(parseMentions("I think @Juniper said this already")).toContain("Juniper");
  });

  it("finds several", () => {
    const found = parseMentions("@Cedar and @Slate both said it");
    expect(found).toContain("Cedar");
    expect(found).toContain("Slate");
  });

  /**
   * Candidates rather than names. Nothing here knows which of these is a
   * person — the database does, and it is the thing that decides.
   */
  it("offers the longer readings too, longest first", () => {
    const found = parseMentions("@Sam Okonkwo said so");
    expect(found).toContain("Sam");
    expect(found).toContain("Sam Okonkwo");
    expect(found.indexOf("Sam Okonkwo")).toBeLessThan(found.indexOf("Sam"));
  });

  it("stops before the sentence runs away with it", () => {
    for (const candidate of parseMentions("@Cedar this is a long message about nothing")) {
      expect(candidate.split(" ").length).toBeLessThanOrEqual(3);
    }
  });

  /** The case that matters: nobody named "example" is being spoken to. */
  it("is not fooled by an email address", () => {
    expect(parseMentions("write to sam@example.com about it")).toEqual([]);
  });

  it("drops the punctuation the sentence owns", () => {
    expect(parseMentions("thanks @Cedar.")).toContain("Cedar");
    expect(parseMentions("thanks @Cedar, really")).toContain("Cedar");
  });

  it("finds nothing in a message that tags nobody", () => {
    expect(parseMentions("that helped, thank you")).toEqual([]);
    expect(parseMentions("meet at 7 @ the park")).toEqual([]);
  });
});

describe("showing who a message is addressing", () => {
  const known = ["Cedar", "Sam Okonkwo", "Sam"];

  it("marks the tag and leaves the rest alone", () => {
    expect(mentionSpans("@Cedar thanks", known)).toEqual([
      { text: "@Cedar", mention: true },
      { text: " thanks", mention: false },
    ]);
  });

  it("prefers the longer name", () => {
    const spans = mentionSpans("@Sam Okonkwo said so", known);
    expect(spans[0]).toEqual({ text: "@Sam Okonkwo", mention: true });
  });

  /**
   * The messages already in the database opened with a bare name, because that
   * is what the box used to write. They still render as names.
   */
  it("still recognises the form the box used to write", () => {
    expect(mentionSpans("Cedar thanks", known)).toEqual([
      { text: "Cedar", mention: true },
      { text: " thanks", mention: false },
    ]);
  });

  it("marks nobody it has not been told about", () => {
    expect(mentionSpans("@Nobody hello", known)).toEqual([
      { text: "@Nobody hello", mention: false },
    ]);
  });

  it("puts the body back together exactly", () => {
    for (const body of [
      "@Cedar thanks",
      "Cedar thanks",
      "I think @Sam Okonkwo said this, and @Cedar agreed",
      "no tags here at all",
      "sam@example.com",
    ]) {
      expect(
        mentionSpans(body, known)
          .map((s) => s.text)
          .join(""),
      ).toBe(body);
    }
  });
});

describe("the box and the cancel button agree", () => {
  /**
   * These drifted the moment the "@" was added by hand in one of them: the
   * composer wrote "@Cedar " and the cancel button stripped "Cedar", leaving a
   * lone "@" at the front of the message.
   */
  it("writes something the same function can find again", () => {
    const written = mentionPrefix("Cedar");
    expect(written.startsWith("@")).toBe(true);
    expect(parseMentions(written)).toContain("Cedar");
  });
});
