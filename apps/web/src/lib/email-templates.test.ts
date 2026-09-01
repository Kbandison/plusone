import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CONTENT_BLIND_BANNED_TERMS } from "@plusone/config";
import { PALETTE } from "@plusone/ui-tokens";

/**
 * The Supabase email templates, which nothing else checks.
 *
 * They are pasted into a dashboard by hand — there is no config.toml here, no
 * build step, and no deploy that touches them. So the only thing standing
 * between two hand-maintained files and two different brands is this.
 *
 * Narrow on purpose, and worth saying what it does NOT cover: it cannot tell
 * whether what is pasted into Supabase matches what is in this repo. Nothing
 * can. It checks that these two files agree with each other and with the
 * palette.
 */
const read = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../supabase/templates/${name}`, import.meta.url)),
    "utf8",
  );

const magicLink = read("magic-link.html");
const changeEmail = read("change-email.html");
const templates = [
  ["magic-link.html", magicLink],
  ["change-email.html", changeEmail],
] as const;

describe("the suite is reading the templates it checks", () => {
  it("read both files", () => {
    // A floor. Every assertion below is "this string is present", so a suite
    // reading nothing would pass for ever.
    for (const [name, source] of templates) {
      expect(source.length, name).toBeGreaterThan(2000);
    }
  });
});

describe("both emails are the same brand", () => {
  it("uses the Linen palette, not colours somebody picked", () => {
    const linen = PALETTE.linen;
    for (const [name, source] of templates) {
      for (const token of [linen.ground, linen.surface, linen.ink, linen.ink2, linen.accent]) {
        expect(source.toUpperCase(), `${name} is missing ${token}`).toContain(token.toUpperCase());
      }
    }
  });

  it("carries the Dusk palette for clients that ask", () => {
    const dusk = PALETTE.dusk;
    for (const [name, source] of templates) {
      expect(source, name).toContain("prefers-color-scheme: dark");
      for (const token of [dusk.ground, dusk.surface, dusk.ink, dusk.accent]) {
        expect(source.toLowerCase(), `${name} is missing ${token}`).toContain(token.toLowerCase());
      }
    }
  });

  it("renders the wordmark identically in both", () => {
    // The one element that IS the brand here, since no image is allowed.
    const mark = /<span class="p1-accent"[^>]*>&#8314;<\/span>One/;
    for (const [name, source] of templates) expect(source, name).toMatch(mark);
  });
});

describe("no email carries a remote resource", () => {
  /**
   * lib/email.ts refuses HTML for the app's own mail for this reason, and the
   * reason survives being written in HTML: a request for a remote image tells a
   * server that this address opened a message from ⁺One, at a time, from an IP.
   * These templates are styled and still ask for nothing.
   */
  it("has no image, no external stylesheet, no remote url", () => {
    for (const [name, source] of templates) {
      expect(source, name).not.toMatch(/<img\b/i);
      expect(source, name).not.toMatch(/<link\b/i);
      expect(source, name).not.toMatch(/url\(/i);
      expect(source, name).not.toMatch(/https?:\/\/(?!www\.w3\.org)/i);
    }
  });
});

describe("no email says what this app is about", () => {
  /**
   * §8 keeps condition words out of every payload, and an email persists in an
   * inbox in a way a lock-screen line does not. The same banned list the
   * notification matrix uses, applied to the two mails Supabase sends.
   */
  it("contains no banned term", () => {
    for (const [name, source] of templates) {
      // The RENDERED body, comments stripped. The claim is about what a
      // recipient sees; an HTML comment explaining §8 is not a payload, and on
      // its first run this test failed on the word "condition" inside the
      // comment that describes the rule it is enforcing.
      //
      // Word boundaries because the list is matched as substrings and several
      // of its terms are short: "sti" is inside "still", which is how the same
      // first run also flagged a sentence about a URL.
      const body = source.replace(/<!--[\s\S]*?-->/g, "").toLowerCase();
      for (const term of CONTENT_BLIND_BANNED_TERMS) {
        const t = term.toLowerCase();
        const pattern = /^[a-z]+$/.test(t)
          ? new RegExp(`\\b${t}\\b`)
          : new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        expect(pattern.test(body), `${name} mentions "${term}"`).toBe(false);
      }
    }
  });
});
