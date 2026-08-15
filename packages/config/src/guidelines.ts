/**
 * Community guidelines and FAQ (§7.1).
 *
 * DRAFT — not from the spec, written at Kevin's request.
 *
 * The voice is §3.2: warm, plain, adult; never clinical, never cutesy, never
 * pitying. The condition is context, not identity.
 *
 * Two things these deliberately do NOT do:
 *
 *   · Explain what HSV or HIV are. Everyone here already knows, most of them
 *     better than we do, and a page of medical basics on a dating app reads as
 *     talking down to the people using it.
 *   · Promise anything the product does not do. Every claim below is checkable
 *     against a migration or a test — the FAQ is a place people go when they
 *     are deciding whether to trust this, so it is the worst possible place to
 *     round up.
 */

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly body: readonly string[];
  readonly list?: readonly string[];
}

export const GUIDELINES_INTRO =
  "Short version: everyone here has already done the hard part. Treat people like that is true.";

export const COMMUNITY_GUIDELINES: readonly Section[] = [
  {
    id: "be-a-person",
    title: "Be a person",
    body: [
      "Every profile here is a verified human, which means the person reading your message is real and is having a day of their own. Write like you know that.",
      "You do not have to be charming. You do have to be decent.",
    ],
  },
  {
    id: "status-is-not-a-topic",
    title: "Nobody owes you their medical history",
    body: [
      "Community and condition type are on a profile because they decide who sees whom. That is the whole of what anyone has agreed to share.",
      "Asking someone for numbers, dates, test results, or how they got it is not conversation. Nobody here has to explain themselves to be worth talking to.",
      "If somebody chooses to tell you more, that is theirs to give and yours to keep.",
    ],
  },
  {
    id: "what-leaves-this-app",
    title: "What is said here stays here",
    body: [
      "Do not screenshot people. Do not repost profiles, messages, or photos anywhere. Do not tell anyone who you saw on here.",
      "Members of this community have been outed before, and some of them by people who thought it was harmless. It is not harmless. This is the fastest way to be removed permanently.",
    ],
  },
  {
    id: "no-unwanted-sexual-content",
    title: "Ask first",
    body: [
      "No sexual photos, no sexual messages, and no propositions until you have some idea the other person wants them. Enthusiasm is not assumed from a match.",
      "If someone changes the subject, the subject is changed.",
    ],
  },
  {
    id: "closing-well",
    title: "Say something on the way out",
    body: [
      "Every chat here ends with a note, because being left on read is the thing this app exists to stop. Picking a template takes one tap and it is never rude.",
      "Ending something honestly is a kindness. Disappearing is the only version that is not.",
    ],
  },
  {
    id: "rooms",
    title: "In the rooms",
    body: [
      "The rooms are for talking, not for approaching people. There is no direct message button in them on purpose — if you want to reach someone you met there, send a connect.",
      "Newly diagnosed members read these rooms more than anyone. Answer the question that was asked, and leave the war stories for people who ask for them.",
    ],
  },
  {
    id: "what-gets-you-removed",
    title: "What gets you removed",
    body: ["Some of this is a warning. Some of it is immediate."],
    list: [
      "Outing anyone, anywhere, in any way.",
      "Pretending to be someone you are not.",
      "Harassment, threats, or following someone across the app after they have blocked you.",
      "Unsolicited sexual content.",
      "Asking anyone under 18 for anything at all. This one is reported, not warned.",
      "Using this place to sell, recruit, or run a scam.",
    ],
  },
  {
    id: "reporting",
    title: "If something goes wrong",
    body: [
      "Report it. A moderator reads every report, and you never have to justify blocking someone — blocking is immediate, mutual, and needs no reason.",
      "Reporting and blocking are separate on purpose. You can do one, or both, and doing both does not cost you the ability to see what happened.",
    ],
  },
] as const;

// ── FAQ ──────────────────────────────────────────────────────────────────────

export interface FaqEntry {
  readonly id: string;
  readonly question: string;
  readonly answer: readonly string[];
}

export const FAQ: readonly FaqEntry[] = [
  {
    id: "what-is-this",
    question: "What is this?",
    answer: [
      "A dating and support app for people living with HSV and HIV. Everyone here has already had the conversation you have been dreading, which means you do not have to have it again on a first date.",
    ],
  },
  {
    id: "who-can-see-me",
    question: "Who can see my profile?",
    answer: [
      "Verified members in your own community, within your distance range. Nobody else — not the public web, not search engines, not members of the other community unless you have both opted in.",
      "This is enforced in the database rather than in the app, so a bug in a screen cannot show your profile to someone who should not see it.",
    ],
  },
  {
    id: "will-people-i-know-see-me",
    question: "What if someone I know is on here?",
    answer: [
      "They might be. Everyone here is in the same position, and anyone who recognises you has the same reason to be discreet that you do.",
      "You can block anyone at any time, with no explanation. A block is immediate and works both ways: they disappear from your view and you from theirs.",
    ],
  },
  {
    id: "verification",
    question: "Why do I have to verify?",
    answer: [
      "Because fake profiles are the single biggest complaint about every other app in this space, and the only way to promise there are none is to check.",
      "It is a phone number and one selfie, checked automatically, usually in under two minutes. The selfie is deleted as soon as the check finishes — we keep whether it passed, and nothing else. No documents, no ID, no medical records, ever.",
    ],
  },
  {
    id: "the-drop",
    question: "What is the Drop?",
    answer: [
      "Three people, once a day, chosen for you. Not a feed to scroll and not a deck to swipe — three, and then you are done for the day.",
      "Everyone gets three. It does not change if you pay, and there is no way to buy a fourth.",
      "If there are not many people near you, you get fewer, and the app says so rather than filling the gap with profiles nobody has opened in months.",
    ],
  },
  {
    id: "the-fuse",
    question: "Why do my chats have a timer?",
    answer: [
      "Every chat has seven days to turn into a plan. If it does not, it closes on its own — with a note, to both of you.",
      "It is there so that nothing sits half-alive for months, and so that nobody is left wondering whether they were ghosted. Confirm a plan with someone and the timer disappears.",
      "You cannot buy more time, and neither can anyone else. That is the point of it.",
    ],
  },
  {
    id: "ghosting",
    question: "What happens if someone stops replying?",
    answer: [
      "The chat closes on its own and you get a note. Every ending here carries one — declining, closing early, or running out of time.",
      "You will not be left refreshing something that was over a week ago.",
    ],
  },
  {
    id: "support-only",
    question: "What if I am not looking to date?",
    answer: [
      "Switch to support-only mode. You disappear from dating entirely — no Drop, no browse, and nobody can send you a connect — and you keep every community room.",
      "You can leave dating instantly, whenever you want. Coming back takes thirty days, so that the mode is a decision rather than a switch to flick.",
    ],
  },
  {
    id: "cost",
    question: "What does it cost?",
    answer: [
      "The free version is a real app: your profile, verification, the Drop, browse, real messaging, three connects a day, and every community room.",
      "Premium raises how many people you can reach and gives you more control over browsing. It never buys you a bigger Drop, more time on a chat, or a way around anyone's privacy settings. Those are not for sale here at any price.",
    ],
  },
  {
    id: "photos",
    question: "Do I have to show my face?",
    answer: [
      "You choose. Photos can be clear to everyone who can see your profile, or blurred until you and someone else have both said yes.",
      "Blurred means blurred before it leaves our servers. The clear version is not sent to anyone who has not connected with you.",
    ],
  },
  {
    id: "notifications",
    question: "What do your notifications say?",
    answer: [
      "As little as possible. “You have a new message.” “Tonight’s Drop is ready.” Never a name, never a preview, and never a word about anyone’s health.",
      "Every email we send has the same subject line. Someone glancing at your phone learns nothing.",
    ],
  },
  {
    id: "deleting",
    question: "What happens if I leave?",
    answer: [
      "Everything goes. Within seven days your profile, photos, messages and every other row belonging to you are removed from our database and our file storage, and any subscription is cancelled.",
      "It is a deletion, not a hidden account waiting to be reactivated.",
    ],
  },
] as const;
