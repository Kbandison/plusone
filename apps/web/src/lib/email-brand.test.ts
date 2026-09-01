import { describe, expect, it } from "vitest";

import { CONTENT_BLIND_BANNED_TERMS } from "@plusone/config";
import { PALETTE } from "@plusone/ui-tokens";

import { brandEmailHtml } from "./email-brand";

const sample = brandEmailHtml({
  body: "Tonight's Drop is ready.",
  url: "https://www.loveplusone.app/app",
  action: "Open ⁺One",
  footer: "You can turn these off in Settings.",
});

/**
 * The branded shell for the app's own mail.
 *
 * The property that matters is not how it looks — it is that making it look
 * like something did not quietly reintroduce the thing plain text was avoiding.
 */
describe("the branded email asks for nothing remote", () => {
  it("has no image, stylesheet, font or third-party url", () => {
    // The reason this file exists in the shape it does: a remote request tells
    // a server that this address opened a message from ⁺One, at a time, from an
    // IP. Styling it must not buy that back.
    expect(sample).not.toMatch(/<img\b/i);
    expect(sample).not.toMatch(/<link\b/i);
    expect(sample).not.toMatch(/@import|url\(/i);
    expect(sample).not.toMatch(/<script\b/i);
  });

  it("links only where the caller sent it", () => {
    const urls = [...sample.matchAll(/https?:\/\/[^"'\s>]+/gi)].map((m) => m[0]);
    expect(urls).toEqual(["https://www.loveplusone.app/app"]);
  });

  it("emits no link at all when there is nowhere to go", () => {
    const plain = brandEmailHtml({ body: "Hello.", footer: "Because you signed up." });
    expect(plain).not.toMatch(/<a\b/i);
    expect(plain).not.toMatch(/https?:\/\//i);
  });
});

describe("the shell cannot drift from the brand", () => {
  it("takes its colours from PALETTE rather than restating them", () => {
    for (const c of [PALETTE.linen.ground, PALETTE.linen.surface, PALETTE.linen.accent]) {
      expect(sample).toContain(c);
    }
    for (const c of [PALETTE.dusk.ground, PALETTE.dusk.accent]) {
      expect(sample).toContain(c);
    }
  });
});

describe("branding does not add meaning to a content-blind payload", () => {
  it("says nothing the matrix bans", () => {
    const body = sample.replace(/<!--[\s\S]*?-->/g, "").toLowerCase();
    for (const term of CONTENT_BLIND_BANNED_TERMS) {
      const t = term.toLowerCase();
      const pattern = /^[a-z]+$/.test(t)
        ? new RegExp(`\\b${t}\\b`)
        : new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      expect(pattern.test(body), `wrapper mentions "${term}"`).toBe(false);
    }
  });

  it("escapes the payload rather than rendering it as markup", () => {
    // The body is a member-facing string. If it ever carried a `<`, it must
    // arrive as a `<` and not as an element.
    const hostile = brandEmailHtml({
      body: '<script>alert(1)</script> & "quoted"',
      footer: "f",
    });
    expect(hostile).not.toMatch(/<script>alert/);
    expect(hostile).toContain("&lt;script&gt;");
    expect(hostile).toContain("&amp;");
  });

  it("carries the caller's footer, because the two senders differ", () => {
    // A notification can be turned off; the waitlist confirmation has no member,
    // no preference and no Settings to point anybody at.
    expect(sample).toContain("You can turn these off in Settings.");
    expect(brandEmailHtml({ body: "x", footer: "Because you signed up." })).toContain(
      "Because you signed up.",
    );
  });
});
