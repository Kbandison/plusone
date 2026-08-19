import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("./page.tsx");
const forms = read("./chat-forms.tsx");
const recorder = read("./voice-recorder.tsx");
const menu = read("./chat-menu.tsx");

/**
 * Close, report and block were three controls stacked under the composer —
 * ending the conversation in the same column as continuing it, and the two a
 * member should almost never need carrying the same weight as the message box.
 *
 * "Always reachable, never prominent" was already the intent written above
 * them. Behind one press is reachable; three buttons under the thing you came
 * here to do is not the second half.
 */
describe("what ends the conversation is folded away", () => {
  it("puts all three in the header menu", () => {
    const header = page.slice(
      page.indexOf('<div className="flex items-center justify-between'),
      page.indexOf("<ul className"),
    );
    expect(header).toMatch(/<ChatMenu>/);
    expect(header).toMatch(/CloseChat/);
    expect(header).toMatch(/ReportControl/);
    expect(header).toMatch(/BlockButton/);
  });

  it("leaves none of them stacked under the composer", () => {
    const belowComposer = page.slice(page.indexOf("<Composer chatId={id} />"));
    expect(belowComposer).not.toMatch(/CloseChat|ReportControl|BlockButton/);
  });

  /** A menu dismissable only by its own button is a trap on a phone. */
  it("closes on an outside press and on Escape", () => {
    expect(menu).toMatch(/pointerdown/);
    expect(menu).toMatch(/event\.key === "Escape"/);
  });

  it("says it is a menu, and what it is", () => {
    expect(menu).toMatch(/aria-expanded=\{open\}/);
    expect(menu).toMatch(/aria-label=\{C\.chatMenuLabel\}/);
  });
});

describe("the composer keeps the screen", () => {
  /**
   * Three empty fields under every open chat read as something the product
   * wants before you have said anything — and §6.2 makes the plan the thing a
   * conversation arrives at, not the thing it starts with.
   */
  it("collapses the date proposal until it is asked for", () => {
    expect(forms).toMatch(/const \[open, setOpen\] = useState\(false\)/);
    expect(forms).toMatch(/if \(!open\) \{/);
    expect(forms).toMatch(/aria-expanded=\{false\}/);
  });

  /** An icon, with its label as the accessible name rather than beside it. */
  it("makes the voice note a microphone", () => {
    expect(recorder).toMatch(/<MicIcon \/>/);
    expect(recorder).toMatch(/aria-label=\{C\.voiceRecordLabel\}/);
  });

  it("puts them on one row rather than stacking them", () => {
    expect(page).toMatch(/<VoiceRecorder chatId=\{id\} \/>\s*\n\s*\{chat\.status === "open"/);
  });

  /**
   * §7.2 wants the fuse visible; where it is visible is the question. At the
   * top it was a number scrolled past on the way to the conversation.
   */
  it("moves the fuse next to the box it is a deadline for", () => {
    const fuse = page.indexOf("countdown.isRunning");
    expect(fuse).toBeGreaterThan(page.indexOf("<ul className"));
    expect(fuse).toBeLessThan(page.indexOf("<Composer"));
  });
});

/**
 * Report and block used to hang off the live-chat branch, so a closed chat
 * showed neither — removing them from exactly the member most likely to reach
 * for them. §11 wants reporting always available; a chat ending is not a reason
 * to stop being able to report the person it ended with.
 */
describe("reporting survives the chat", () => {
  it("keeps the menu on terminal chats", () => {
    const header = page.slice(
      page.indexOf('<div className="flex items-center justify-between'),
      page.indexOf("<ul className"),
    );
    expect(header).toMatch(/<ChatMenu>/);
    expect(header).not.toMatch(/\{!isTerminal \? \(\s*<ChatMenu>/);
  });

  it("drops only the close control when there is nothing left to close", () => {
    expect(page).toMatch(/\{!isTerminal \? \(\s*<CloseChat/);
  });
});
