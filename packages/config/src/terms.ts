/**
 * Terms of service (§7.1).
 *
 * DRAFT — needs counsel before launch, exactly as the privacy policy does
 * (Decision #30). Written to be readable rather than to be exhaustive, which is
 * a trade a lawyer may want to reverse in places.
 *
 * Two things it deliberately does not do:
 *
 *   · Claim rights over anyone's content beyond running the service. A dating
 *     app asking for a perpetual worldwide licence to a member's photos is
 *     standard, and standard is not a reason.
 *   · Promise the app is safe. It says what we do and what we cannot do —
 *     "verified human" is a claim about identity, not about character, and
 *     conflating them would be the most consequential lie on the page.
 */

export const TERMS_EFFECTIVE = "2026-08-15";

export interface TermsSection {
  readonly id: string;
  readonly title: string;
  readonly body: readonly string[];
  readonly list?: readonly string[];
}

export const TERMS_INTRO =
  "The rules of using Plus One, in plain words. Where this is shorter than you expect, it is because we have tried not to ask for things we do not need.";

export const TERMS: readonly TermsSection[] = [
  {
    id: "who-can-use-it",
    title: "Who can use this",
    body: [
      "Adults, aged 18 or over. We check your date of birth at sign-up and the app will not let you finish without it.",
      "One account per person. Verification exists so that everyone here is a real, distinct human, and a second account undermines the only promise this app makes to everybody at once.",
    ],
  },
  {
    id: "what-you-tell-us",
    title: "What you tell us has to be true",
    body: [
      "Your photos should be of you and recent. Your age should be your age. Your community and condition type should be accurate, because other people are making decisions about their own health with them.",
      "Nobody is asking you to prove any of it, and we never will. The whole model rests on people being honest with each other where they could easily not be.",
    ],
  },
  {
    id: "how-you-behave",
    title: "How you treat people",
    body: [
      "The community guidelines are part of these terms. The short version: do not out anyone, do not interrogate anyone about their health, ask before anything sexual, and say something on the way out.",
      "Breaking them can mean a warning, a suspension, or removal. Outing someone means removal.",
    ],
  },
  {
    id: "your-content",
    title: "Your photos and messages stay yours",
    body: [
      "You own what you write and upload. You give us permission to store it and show it to the people you have chosen to show it to — and nothing else.",
      "We do not use your photos in advertising, we do not train anything on your messages, and we do not licence your content to anyone. When you delete your account it goes, permanently, within seven days.",
    ],
  },
  {
    id: "what-we-provide",
    title: "What we do and do not promise",
    body: [
      "We verify that every member is a real, distinct person. That is a claim about identity, not about character — verification cannot tell you whether someone is kind, honest, or safe to meet.",
      "Meet in public the first time. Tell someone where you are going. Those are not disclaimers, they are the same advice we would give a friend.",
      "We do not promise the app will always be available, or that you will meet anyone. We do promise the mechanics work the way we describe them, and if they stop we will say so.",
    ],
  },
  {
    id: "payment",
    title: "Paying",
    body: [
      "Premium is a subscription that renews until you cancel. You can cancel any time from Settings and keep what you have paid for until the period ends.",
      "Prices are shown before you pay. If we change them, existing subscriptions keep their price until the next renewal and we will tell you first.",
      "Premium never buys an exemption from any mechanic in this app. That list is published on the pricing page and it is part of these terms.",
    ],
  },
  {
    id: "ending-it",
    title: "Ending your account",
    body: [
      "You can delete your account at any time, from Settings, with no questions. It is permanent.",
      "We can remove an account that breaks these terms or the guidelines. Where it is not an immediate-removal case, we will tell you why and you can reply — the appeal never requires passing whatever check you are appealing.",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: [
      "If we change something that affects what you agreed to, we will tell you in the app before it takes effect. Health-data consent is separate and is always asked for again rather than assumed.",
    ],
  },
  {
    id: "law",
    title: "The legal part",
    body: [
      "These terms are governed by the law of the place we are established, and nothing in them takes away rights you have where you live that cannot be signed away.",
      "If a court finds part of this unenforceable, the rest still stands.",
    ],
  },
];
