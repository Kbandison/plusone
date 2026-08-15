import { COPY } from "./copy";

/**
 * The how-it-works page (§7.1).
 *
 * DRAFT where it is not quoting the spec. The three explainers members actually
 * read in the app — the fuse, U=U, support-only — are §3.4 verbatim and are
 * pulled in rather than rewritten: a marketing page that describes a mechanic
 * differently from the screen that runs it is the beginning of two products.
 *
 * The order is the order someone experiences it: verify, get the Drop, connect,
 * talk, end well. Not the order it was built in, and not the order that shows
 * off the cleverest part first.
 */

export interface HowItWorksStep {
  readonly id: string;
  readonly title: string;
  readonly body: readonly string[];
  /** Pulled from §3.4 where the app already says it. */
  readonly quoted?: string;
}

export const HOW_IT_WORKS_INTRO =
  "Five things happen here, in this order. None of them can be bought out of.";

export const HOW_IT_WORKS: readonly HowItWorksStep[] = [
  {
    id: "verify",
    title: "Everyone verifies",
    body: [
      "A phone number and one selfie, checked automatically. Usually under two minutes, with nobody reading it and nothing to upload.",
      "The selfie is deleted the moment the check finishes. We keep whether it passed, and that is all.",
    ],
    quoted: COPY.marketing.verificationPitch,
  },
  {
    id: "drop",
    title: "Three people a night",
    body: [
      "Not a feed and not a deck. Three profiles, chosen for you, once a day — and then you are done.",
      "Everyone gets three. It does not grow if you pay, and there is no way to buy a fourth.",
      "If there are not many people near you, you get fewer and we say so, rather than filling the gap with profiles nobody has opened since March.",
    ],
  },
  {
    id: "connect",
    title: "A connect is a reply",
    body: [
      "There is no swiping and no wave. To reach someone you answer one of the prompts on their profile, which means the first thing they read from you is about them.",
      "It also means saying something takes a minute, which is the point. Three a day on the free tier.",
    ],
  },
  {
    id: "fuse",
    title: "Every chat has seven days",
    body: [
      "Confirm a plan together and the timer disappears. Let it run out and the chat closes on its own, with a note, to both of you.",
      "You cannot buy more time and neither can anyone else. A timer you can pay to pause is not a deadline, it is a checkout.",
    ],
    quoted: COPY.fuse.explainer,
  },
  {
    id: "closure",
    title: "Nothing ends in silence",
    body: [
      "Declining a connect sends a note. Closing a chat sends a note. Running out of time sends a note. There is no button anywhere on this app that ends something quietly.",
      "You choose which note. You never choose whether.",
    ],
  },
  {
    id: "support-only",
    title: "And you can step back",
    body: [
      "Support-only mode takes you out of dating entirely and leaves every community room open. Leaving is instant; coming back takes thirty days, so the mode means something.",
    ],
    quoted: COPY.supportOnly.toggle,
  },
];

/**
 * The public pricing page (§7.1).
 *
 * The "never" list is not a footnote here. It is the more interesting half of
 * what is being sold — every other app in this space sells exactly the things
 * on it — and burying it would make this page the one place the product argues
 * against itself.
 */
export const PRICING_INTRO =
  "The free version is a real app: your profile, verification, the Drop, browse, real messaging, three connects a day, and every community room. Premium raises how far you can reach.";

export const PRICING_NEVER_NOTE =
  "Not at any price, and not later. These are the mechanics that make this place work, and selling exemptions from them would be selling the place itself.";
