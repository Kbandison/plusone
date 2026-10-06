import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(here(p), "utf8");
const noComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

const panel = noComments(read("./connect-panel.tsx"));
const chat = noComments(read("../../chats/[id]/page.tsx"));

/**
 * Reported by Kevin 2026-10-06, from a real profile in the beta: the sheet
 * showed somebody's photo as a 56px circle and nothing larger. She has one
 * photo, so the gallery grid — which started at the SECOND — had nothing to
 * show, and the only large photos this screen could ever render were the extra
 * ones. Tapping a name in a chat opened nothing at all.
 */
describe("a profile shows the person", () => {
  it("leads with the first photo at the Drop card's size", () => {
    expect(panel).toMatch(
      /photo=\{gallery\[0\]\}\s*fill\s*className="aspect-\[4\/5\] w-full rounded-xl"/,
    );
    expect(panel).not.toMatch(/size=\{56\}/);
  });

  it("shows the rest as large as the first, not in a thumbnail grid", () => {
    const rest = panel.slice(panel.indexOf("gallery.slice(1)"));
    expect(rest).toMatch(/fill className="aspect-\[4\/5\] w-full rounded-xl"/);
    expect(panel).not.toMatch(/grid-cols-2/);
  });

  /** Without the line, a blurred photo at this size reads as a broken one. */
  it("says when a photo is blurred, as the cards do", () => {
    expect(panel).toMatch(/gallery\.some\(\(photo\) => photo\.isBlurred\)/);
    expect(panel).toMatch(/C\.photoBlurredNote/);
  });
});

describe("a profile knows when you are already talking", () => {
  it("offers the chat, not a connect that can only fail", () => {
    const connected = panel.slice(
      panel.indexOf('standing.kind === "connected"'),
      panel.indexOf('standing.kind === "waiting_on_them"'),
    );
    expect(connected).toMatch(/href=\{`\/app\/chats\/\$\{standing\.chatId\}`\}/);
    expect(connected).not.toMatch(/<ConnectForm/);
  });

  it("says a pending connect is waiting, in whichever direction", () => {
    expect(panel).toMatch(/C\.connectWaitingOnThem/);
    expect(panel).toMatch(/C\.connectWaitingOnYou/);
    expect(panel).toMatch(/href="\/app\/inbox"/);
  });

  it("still offers the form when there is no live connect", () => {
    // Exactly one ConnectForm, and it is the last branch.
    expect(panel.match(/<ConnectForm/g)).toHaveLength(1);
    expect(panel.lastIndexOf("standing.kind")).toBeLessThan(panel.indexOf("<ConnectForm"));
  });

  /**
   * The id goes into a PostgREST `or` expression. The one visible_profiles
   * returned has already been a uuid to Postgres; the route param has not.
   */
  it("asks about the profile's own id, never the raw route param", () => {
    expect(panel).toMatch(/standingWith\(auth\.user\.id, target\.id as string\)/);
  });
});

describe("a chat opens who you are talking to", () => {
  it("links the header to their profile sheet", () => {
    expect(chat).toMatch(/href=\{`\/app\/connect\/\$\{other\}\?source=chat`\}/);
  });

  /** Blocked, or left dating: visible_profiles names nobody, so there is no sheet. */
  it("only when there is a profile to open", () => {
    expect(chat).toMatch(/\{other && otherName \? \(\s*<Link/);
  });

  it("keeps a 44px target on the link", () => {
    const link = chat.slice(chat.indexOf("/app/connect/${other}"));
    expect(link.slice(0, 200)).toMatch(/min-h-tap/);
  });
});

/**
 * A slot keeps its last render across a soft navigation to a URL it does not
 * match (parallel-routes.md). Without a null catch-all, "Open chat" would load
 * the chat underneath and leave the sheet over it.
 */
describe("leaving the sheet closes it", () => {
  const catchAll = "../../@modal/[...catchAll]/page.tsx";

  it("has a catch-all in the slot that renders nothing", () => {
    expect(existsSync(here(catchAll))).toBe(true);
    expect(noComments(read(catchAll))).toMatch(/return null/);
  });
});
