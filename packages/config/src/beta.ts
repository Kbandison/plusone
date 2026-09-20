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
  /**
   * Where to report, named in the welcome because it CANNOT BE DISCOVERED.
   *
   * The control is a speech bubble in the header with no visible label — an
   * aria-label, so a screen reader announces it and a sighted person meets a
   * shape. That is fine for a member who will eventually wonder; it is not fine
   * for a tester, whose whole job is the sentence above this one. Asking people
   * to report bugs without saying where is asking them to go looking.
   *
   * Kevin, 2026-09-20. It is also the `why` on the checklist's last row, which
   * is where somebody is actually about to do it — two places, because this is
   * the one instruction in the app that has to survive being skimmed.
   */
  reporting: "The speech bubble at the top of any screen sends a report from wherever you are.",
  premium: {
    heading: `${BETA_THANKS_MONTHS} months of Premium, free`,
    /**
     * The timing, in the same breath as the offer.
     *
     * Not a caveat added afterwards — somebody who reads "free premium" and then
     * finds Settings saying otherwise has been misled, however carefully the
     * second sentence is worded.
     *
     * It said "…in your area, not today — your area is still filling up." Kevin
     * cut the middle: "starts when it opens in your area" already says it is not
     * today, and saying so twice turns an offer into an apology for itself.
     */
    body: "It starts when Plus One opens in your area. We will tell you the day it does.",
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
   * Why it is on the list, in as few words as the row can carry.
   *
   * Shown, because "send a connect" with no reason reads as a chore. Cut back
   * on 2026-09-17: five of the eight were a second sentence explaining the
   * first, or admiring the design rather than telling a tester anything — "the
   * one mechanic nobody expects, and the one most likely to be misread as a
   * missing feature" says nothing somebody can act on. One of them was worse
   * than long: "it must never be wrong in the safe direction" is close to
   * meaningless, and it is now the thing it was trying to say.
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
    why: "The prompts are how anybody reaches you.",
  },
  {
    id: "drop",
    label: "Open tonight's Drop",
    href: "/app",
    why: "It may be thin while your area fills up. Tell us if that reads as broken.",
  },
  {
    id: "connect",
    label: "Send a connect by answering a prompt",
    href: "/app/browse",
    why: "Nobody expects this one. Tell us how it lands.",
  },
  {
    id: "room",
    label: "Post in a room, and reply to someone",
    href: "/app/rooms",
    why: "Replies drive the badge on the nav. If one stays after you have read it, tell us.",
  },
  {
    id: "photos",
    label: "Try the photo privacy controls",
    href: "/app/profile",
    why: "It must never show a photo somebody blurred.",
  },
  {
    id: "notifications",
    label: "Turn notifications on, and check one arrives",
    href: "/app/settings/notifications",
    why: "It behaves differently on iOS, on Android and in a browser.",
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
    why: "Even if nothing is broken. It is the speech bubble at the top of any screen.",
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
