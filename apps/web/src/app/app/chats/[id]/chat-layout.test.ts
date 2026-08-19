import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const page = read("./page.tsx");
const forms = read("./chat-forms.tsx");
const recorder = read("./voice-recorder.tsx");
const menu = read("./chat-menu.tsx");
const icons = read("./chat-icons.tsx");

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
    expect(page).toMatch(/\{!isTerminal \? \([\s\S]{0,80}<CloseChat/);
  });
});

describe("the menu reads as a list", () => {
  /** Report and block were a horizontal pair — a toolbar, not a menu. */
  it("rules a divider between every item", () => {
    expect(menu).toMatch(/divide-y divide-line/);
  });

  it("gives each control its own row rather than a shared line", () => {
    const block = page.slice(page.indexOf("<ChatMenu>"), page.indexOf("</ChatMenu>"));
    expect(block.match(/<div className="py-3">/g)).toHaveLength(3);
    expect(block).not.toMatch(/flex items-center gap-4/);
  });

  /**
   * mt-10 was breathing room for the bottom of the composer column. Carried
   * into a popover it became 40px of empty space above the first item.
   */
  it("leaves the close trigger no margin of its own", () => {
    const trigger = forms.slice(forms.indexOf("export function CloseChat"));
    const className = /className="ease-brand[^"]*"/.exec(trigger)![0];
    expect(className).not.toMatch(/\bmt-\d/);
  });

  /**
   * The forms moved out. Close and report each raise a modal and block asks
   * for a confirmation, so the menu is a list of three words again — it does
   * not need to be wide, and it has nothing to scroll.
   */
  it("stays narrow, holding nothing that opens inside it", () => {
    expect(menu).toMatch(/w-\[232px\]/);
    expect(menu).not.toMatch(/overflow-y-auto|max-h-/);
  });
});

describe("the header shows who you are talking to", () => {
  it("puts their photo beside the name", () => {
    expect(page).toMatch(/<MemberPhotoFrame photo=\{otherPhoto\}/);
    expect(page).toMatch(/photosFor\(\[other\]\)/);
  });
});

describe("the icons are big enough to see", () => {
  /**
   * 17px centred in a 44px bordered box read as an empty button. Width and
   * height attributes as well as the class, so the glyph does not vanish if the
   * utility is ever purged.
   */
  it("sizes the microphone in the icon itself", () => {
    const mic = icons.slice(
      icons.indexOf("export function MicIcon"),
      icons.indexOf("export function CalendarIcon"),
    );
    expect(mic).toMatch(/width="22"/);
    expect(mic).toMatch(/height="22"/);
    expect(mic).toMatch(/size-\[22px\]/);
  });

  it("keeps all three above the 16px floor", () => {
    for (const size of icons.match(/size-\[(\d+)px\]/g) ?? []) {
      expect(Number(/(\d+)/.exec(size)![1])).toBeGreaterThanOrEqual(18);
    }
  });
});

const modal = read("../../../modal.tsx");
const safety = read("../../safety/safety-controls.tsx");

/**
 * The three menu items each opened a disclosure below themselves. That was
 * tolerable at the bottom of a page with room beneath it, and impossible inside
 * a 232px popover — the report form alone is five radio options, a textarea and
 * a checkbox.
 */
describe("what the menu items open", () => {
  it("raises the closure note in a modal", () => {
    const start = forms.indexOf("export function CloseChat");
    const end = forms.indexOf("export function", start + 1);
    expect(forms.slice(start, end)).toMatch(/<Modal/);
  });

  it("raises the report form in a modal", () => {
    // ReportControl is last in the file; Block and Unblock come above it.
    const report = safety.slice(safety.indexOf("export function ReportControl"));
    expect(report).toMatch(/<Modal/);
    expect(report).not.toMatch(/aria-expanded/);
  });

  /**
   * Block submitted the moment it was pressed. One row from Report in a menu,
   * with no undo from the chat, a mis-tap silently removed somebody.
   */
  it("asks before blocking, without asking why", () => {
    const block = safety.slice(
      safety.indexOf("export function BlockButton"),
      safety.indexOf("export function UnblockButton"),
    );
    expect(block).toMatch(/C\.blockConfirm\b/);
    expect(block).toMatch(/C\.blockConfirmLabel/);
    expect(block).toMatch(/C\.blockKeepLabel/);
    // No reason field: confirming is not justifying.
    expect(block).not.toMatch(/textarea|type="radio"/);
  });

  /**
   * showModal() makes the rest of the page inert, so a dialog's outline is its
   * own — the heading level stopped depending on what sat behind it.
   */
  it("drops the heading level the page used to have to supply", () => {
    expect(safety).not.toMatch(/headingLevel/);
  });
});

describe("one dialog, not a family of them", () => {
  it("gets focus trapping, Escape and the backdrop from the platform", () => {
    expect(modal).toMatch(/showModal\(\)/);
    expect(modal).toMatch(/backdrop:bg-black/);
    expect(modal).toMatch(/method="dialog"/);
  });

  /** A click on padding inside the panel must not dismiss it. */
  it("tests the backdrop click against the dialog itself", () => {
    expect(modal).toMatch(/event\.target === dialog\.current/);
  });
});

/**
 * Twenty posts in a room, twenty buttons reading "Report" and twenty reading
 * "Block". describedBy points each one at the post it acts on — using the post
 * itself rather than a label invented for it.
 */
describe("repeated triggers stay told apart", () => {
  it("keeps the description on both triggers", () => {
    expect(safety.match(/triggerDescribedBy=\{describedBy\}/g)).toHaveLength(2);
  });

  /**
   * And never inside the panel: showModal() makes the page inert, inert content
   * leaves the accessibility tree, so a reference into it resolves to nothing
   * at exactly the moment it is needed.
   */
  it("puts none of it inside the dialog", () => {
    // UnblockButton is a plain button on the settings list, not a modal, and
    // keeps its own describedBy — every row there reads "Unblock".
    const modalUsers = safety.slice(0, safety.indexOf("export function UnblockButton"));
    expect(modalUsers).not.toMatch(/aria-describedby=\{describedBy\}/);
    expect(safety.slice(safety.indexOf("export function ReportControl"))).not.toMatch(
      /aria-describedby=\{describedBy\}/,
    );
    expect(modal).toMatch(/aria-describedby=\{triggerDescribedBy\}/);
  });

  it("announces that the trigger opens a dialog", () => {
    expect(modal).toMatch(/aria-haspopup="dialog"/);
  });
});
