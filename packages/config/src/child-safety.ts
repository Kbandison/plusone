/**
 * The child safety standards Google Play requires of every social or dating app.
 *
 * Play's Child safety standards form asks for a link to standards that are
 * "active, publicly available anywhere in the world, and not editable" — so a
 * PDF, a Google Doc, or a page behind a sign-in will all be rejected. It is
 * served at /child-safety and rendered from here, the same way the terms and
 * the privacy policy are.
 *
 * ── every claim on this page is enforced somewhere, and that is the point ────
 *
 * A standards page is worth nothing if it describes intentions. Each statement
 * below names what actually makes it true, checked on 2026-08-28 rather than
 * assumed:
 *
 *   18+          `profiles_adult` — a CHECK constraint in 20260813000200, so it
 *                is the database that refuses, not a form that can be skipped.
 *                MINIMUM_AGE in packages/logic states the same rule where a
 *                form can give a useful answer first.
 *   reporting    `reports`, with `queue_report()` routing every one to a
 *                moderator, and report/block folded behind the overflow menu on
 *                every profile and every room post — "always reachable" is a
 *                stated design rule, not a claim made here.
 *   the rule     COMMUNITY_GUIDELINES already says "Asking anyone under 18 for
 *                anything at all. This one is reported, not warned."
 *
 * If any of those change, this page becomes false, which is why they are named.
 *
 * DRAFT, and it needs counsel. It commits to conduct — preservation, reporting
 * to authorities — and Kevin's item 1 already has the privacy policy and terms
 * with a lawyer. This belongs in the same pass. It is published now because
 * Play blocks a review without it, not because it is finished.
 */

export interface ChildSafetySection {
  readonly id: string;
  readonly title: string;
  readonly body: readonly string[];
}

export const CHILD_SAFETY_INTRO =
  "Plus One is an adults-only app. This page sets out what we do to keep children off it, what we prohibit, and how to report anything that concerns you. It exists so that our standards can be read by anyone, without an account.";

export const CHILD_SAFETY: readonly ChildSafetySection[] = [
  {
    id: "adults-only",
    title: "This app is for adults",
    body: [
      "You have to be 18 or over to use Plus One. That is not only a rule in these standards — the database itself refuses to store a profile with a birthdate under 18 years old, so an account cannot exist below that age even if every screen in front of it were bypassed.",
      "We do not offer a version of this app for children, and we do not knowingly allow anyone under 18 to create an account. If we find one, we remove it.",
    ],
  },
  {
    id: "prohibited",
    title: "What is absolutely prohibited",
    body: [
      "Child sexual abuse and exploitation (CSAE) in any form. That includes sexual content involving anyone under 18, sexualising a minor, grooming, soliciting a minor, trading or linking to such material, and using this app to reach a child anywhere else.",
      "Our community guidelines put it in the shortest form we can: asking anyone under 18 for anything at all. That one is reported, not warned. There is no first offence, no appeal on a technicality, and no threshold below which it is tolerated.",
      "This applies to real imagery, to computer-generated imagery, and to text. It applies whether or not money changed hands, and whether or not anyone believed the other person was an adult.",
    ],
  },
  {
    id: "reporting",
    title: "How to report it",
    body: [
      "Inside the app, report and block sit behind the menu on every profile and every post in a room. They are deliberately always reachable, and blocking is immediate, mutual, and needs no reason. A moderator reads every report.",
      "You do not need an account to reach us about a child safety concern. Email support@loveplusone.app and it goes to a person.",
      "If a child is in immediate danger, contact your local emergency services first. In the United States, the National Center for Missing & Exploited Children takes reports at CyberTipline.org or 1-800-843-5678.",
    ],
  },
  {
    id: "what-we-do",
    title: "What we do when it is reported",
    body: [
      "We remove the account. Not a warning, not a suspension pending appeal — removed.",
      "We preserve the material and the account records to the extent the law requires, rather than deleting them, so that they remain available to an investigation.",
      "We report apparent child sexual abuse material to the National Center for Missing & Exploited Children, as United States law requires of us, and we cooperate with law enforcement requests that are properly made.",
    ],
  },
  {
    id: "prevention",
    title: "What we do to prevent it",
    body: [
      "Every member verifies with a phone number and a liveness check before they can reach anybody. It is not a perfect defence against a determined adult, and it is a meaningful one against casual and automated abuse.",
      "There are no public profiles and no open directory. Nobody can browse this app without an account, and an account requires that verification.",
      "Photos are moderated, and messaging is one-to-one behind a mutual connect rather than open to anyone.",
    ],
  },
  {
    id: "contact",
    title: "Point of contact",
    body: [
      "For child safety and CSAE compliance matters, including law enforcement requests: support@loveplusone.app.",
      "Plus One is operated by LuxWeb Studio LLC.",
    ],
  },
];
