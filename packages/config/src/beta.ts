import { BETA_THANKS_MONTHS } from "./waitlist";

/**
 * What a beta tester meets on their first launch, and what they are asked to try.
 *
 * Kevin's ask 2026-09-16, and the three decisions in it are recorded here
 * because each had a real alternative.
 *
 * ── the premium line is DATED, and that is not softening ───────────────────
 *
 * The grant is not automatic. `admin_grant_beta_thanks` is a button pressed per
 * metro, when that metro is worth being in — which was the whole argument for
 * starting the three months at metro open rather than at signup, since premium
 * is reach and filters and neither is worth anything in a pool of four.
 *
 * So a tester who opens the app on day one has `joined_in_beta` set and NO
 * premium, possibly for months. "You qualify for three months free" would send
 * them to Settings to find they are not premium, which reads as broken. The
 * copy says when it starts, and `beta_thanks_started` tells them the day it
 * does — a promise with no delivery mechanism is worse than no promise.
 *
 * ── the four mechanics come from HINTS ─────────────────────────────────────
 *
 * Kevin chose to name them here AND keep the inline hints. That is two copies
 * of one sentence, and hints.ts says in as many words that a second copy will
 * drift — so this reads `oneLine` off HINTS rather than restating them. There
 * is no list of features in this file, deliberately.
 *
 * ── the checklist is the TESTER'S, and never leaves their device ───────────
 *
 * The alternative was reporting coverage back to an admin screen, which is a
 * table, a privacy classification and both store data-safety forms — and a
 * record of which parts of an HSV and HIV app a named person used. The value
 * Kevin was after is telling somebody what is worth trying; the ticking is
 * their own bookkeeping. Same reasoning and the same storage as HINTS, whose
 * note has the full argument.
 */
export const BETA_WELCOME = {
  heading: "Thanks for testing Plus One",
  /** Said first, because it is the only thing here they did not expect. */
  opening:
    "You are one of the first people in here. Some of it will be thin, some of it will be broken, and we want to hear about both.",
  premium: {
    heading: `${BETA_THANKS_MONTHS} months of Premium, free`,
    /**
     * The timing, in the same breath as the offer.
     *
     * Not a caveat added afterwards — somebody who reads "free premium" and then
     * finds Settings saying otherwise has been misled, however carefully the
     * second sentence is worded.
     */
    body: "It starts when Plus One opens in your area, not today — your area is still filling up. We will tell you the day it does.",
  },
  mechanics: {
    heading: "Four things that are not like other apps",
    /** No list here. See the note above: it is read off HINTS. */
  },
  checklist: {
    heading: "What is worth trying",
    body: "There is a list of things to poke at, and you can tick them off as you go.",
    cta: "Open the checklist",
  },
  dismiss: "Start looking around",
} as const;

export interface BetaCheck {
  /** Stable: it is the storage key. Changing it un-ticks that row for everybody. */
  readonly id: string;
  readonly label: string;
  /** Where it is done. A checklist that does not say where is a quiz. */
  readonly href: string;
  /**
   * Why it is on the list — what breaks here that a tester is uniquely able to
   * see. Shown, because "send a connect" with no reason reads as a chore.
   */
  readonly why: string;
}

/**
 * The list, and why each row is on it.
 *
 * Ordered the way somebody actually meets them, not by importance: a tester who
 * works down this list in order is doing roughly what a new member does, which
 * is the run that finds the most.
 *
 * Every row is something a SESSION cannot check. There is no "does the page
 * load" here — tests cover that. These are the things that need a real phone, a
 * real person and a real other end.
 */
export const BETA_CHECKLIST: readonly BetaCheck[] = [
  {
    id: "profile",
    label: "Finish your profile and answer some prompts",
    href: "/app/profile",
    why: "The prompts are how anybody reaches you. A profile with none is invisible in practice.",
  },
  {
    id: "drop",
    label: "Open tonight's Drop",
    href: "/app",
    why: "It may be empty or thin while your area fills up. Worth knowing whether that reads as broken.",
  },
  {
    id: "connect",
    label: "Send a connect by answering a prompt",
    href: "/app/browse",
    why: "The one mechanic nobody expects, and the one most likely to be misread as a missing feature.",
  },
  {
    id: "room",
    label: "Post in a room, and reply to someone",
    href: "/app/rooms",
    why: "Replies drive the badge on the nav. If a badge stays after you have read something, tell us.",
  },
  {
    id: "photos",
    label: "Try the photo privacy controls",
    href: "/app/profile",
    why: "Blurring is the thing people here care most about getting right. It must never be wrong in the safe direction.",
  },
  {
    id: "notifications",
    label: "Turn notifications on, and check one arrives",
    href: "/app/settings/notifications",
    why: "This behaves differently on iOS, on Android and in a browser, and we cannot test all three from here.",
  },
  {
    id: "report",
    label: "Find the block and report controls",
    href: "/app/inbox",
    why: "They live inside a chat and a room post. If you cannot find them, that is the bug.",
  },
  {
    id: "feedback",
    label: "Send us one piece of feedback",
    href: "/app/feedback",
    why: "Even if nothing is broken. It records which of the three apps you are on, which we cannot work out afterwards.",
  },
];

export const BETA_CHECK_IDS: readonly string[] = BETA_CHECKLIST.map((c) => c.id);

/**
 * Storage keys, on the device and nowhere else.
 *
 * Same argument as HINTS_STORAGE_KEY, which has it in full: which parts of an
 * HSV and HIV app a particular person has used is behavioural data, and
 * server-side it would sit in a table, in every backup, and in any subject
 * access request. A cookie is worse — it is sent with every request and lands
 * in access logs. localStorage never leaves the browser.
 *
 * The cost, stated rather than discovered: both reset on a new device, after
 * clearing site data, and once per shell — the TWA shares Chrome's storage and
 * the iOS WebView has its own. For the welcome that means a tester with a phone
 * and an iPad is thanked twice, which is a thing to read again rather than a
 * fault.
 */
export const BETA_WELCOME_STORAGE_KEY = "plusone.beta.welcomed";
export const BETA_CHECKLIST_STORAGE_KEY = "plusone.beta.checked";
