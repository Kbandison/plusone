/**
 * The handful of things this app does that no other app does, said once, where
 * they happen.
 *
 * ── why this is not a tour ──────────────────────────────────────────────────
 *
 * The obvious build is a spotlight tour on first launch: dim the screen, point
 * at a button, Next, Next, Done. It is rejected for a reason that is easy to
 * check — a tour is shown BEFORE somebody has a question, so it is read as an
 * obstacle to the app rather than as help with it, and none of it is on screen
 * at the moment it becomes relevant. Every one of these is a mechanic somebody
 * meets on one specific screen; that is where it belongs.
 *
 * ── and why it is a short list ──────────────────────────────────────────────
 *
 * Most of what a new member needs is ALREADY on the screen and was written
 * carefully: `dropConnectsFree` says replying costs nothing, `chatEmptyBody`
 * says there is no clever opener needed, `browseEmpty` says what to do about an
 * empty grid. A hint repeating any of that is noise, and worse, it is a second
 * copy of a sentence that will drift from the first.
 *
 * So the rule for adding one: **it must teach something no screen says.** Each
 * entry below names the specific misunderstanding it exists to prevent, and
 * hints.test.ts refuses one whose body duplicates existing copy.
 *
 * ── they are content, and the content is the disposable part ────────────────
 *
 * The mechanism is durable; this list is a first guess. `/app/feedback` shipped
 * the same day and is the thing that should decide what belongs here — after a
 * few weeks of real reports, expect this list to be wrong in ways nobody can
 * predict from the inside. Changing it costs one edit.
 */

export interface Hint {
  /**
   * Stable, and part of the storage key.
   *
   * Change it only when the hint means something materially different — that is
   * what un-dismisses it for everybody who already read the old one, which is
   * correct for a changed meaning and rude for a typo fix.
   */
  readonly id: string;
  readonly heading: string;
  readonly body: string;
  /** What somebody gets wrong without it. Not shown; it is the entry's reason to exist. */
  readonly prevents: string;
}

export const HINTS: readonly Hint[] = [
  {
    id: "tonight-is-three",
    heading: "Three people, once a day",
    body: "That is the whole Drop. It does not grow if you wait, and there is no way to buy a fourth — so there is nothing to be missed by closing the app.",
    prevents:
      "Treating an empty Drop as a bug or a punishment, and refreshing for more. Every other app in this category rewards pulling to refresh; this one has nothing behind it.",
  },
  {
    id: "connect-is-a-reply",
    heading: "There is no like button",
    body: "To reach someone you answer one of the prompts on their profile. It takes a minute, which is the point — the first thing they read from you is about them.",
    prevents:
      "Looking for a swipe or a heart, finding neither, and concluding the app is broken or that these people cannot be contacted. The single most non-obvious mechanic here.",
  },
  {
    id: "the-fuse",
    heading: "This chat has seven days",
    body: "Agree a plan together and the timer disappears for good. Let it run out and the chat closes on its own, for both of you, with a note. Nobody can buy more time.",
    prevents:
      "Reading the countdown as pressure from us, or as something that can be topped up. Also the worse one: a chat closing with no warning and reading as being blocked.",
  },
  {
    id: "rooms-are-not-dating",
    heading: "Rooms are not for dating",
    body: "They are for people who want company rather than a date, and nobody has to be looking for anything to belong in one. What you post here is not part of your profile.",
    prevents:
      "Two opposite mistakes: treating a support room as a place to flirt, and avoiding rooms entirely because everything else in the app is about matching.",
  },
];

export const HINT_IDS: readonly string[] = HINTS.map((h) => h.id);

/**
 * The key everything is stored under.
 *
 * ── nothing about this goes in the database, deliberately ───────────────────
 *
 * Which tips somebody has dismissed is behavioural data about how a particular
 * person uses an HSV and HIV app. Stored server-side it would live in a table,
 * in every backup, and in anything we ever have to hand somebody who asks what
 * we hold about them — for the sake of not showing a four-line note twice.
 *
 * A cookie was the other candidate and is worse: it is sent with every single
 * request, so it would end up in access logs. `localStorage` never leaves the
 * browser.
 *
 * What it costs: hints reappear on a new device, after clearing site data, and
 * once per shell — the Android TWA shares Chrome's storage while the iOS
 * WebView has its own. All three are a note somebody reads again, which is a
 * fair price for holding nothing.
 */
export const HINTS_STORAGE_KEY = "plusone.hints.dismissed";
