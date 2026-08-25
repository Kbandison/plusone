/**
 * The privacy policy (§7.1, §9).
 *
 * DRAFT — Decision #30 requires counsel review before public launch. It is
 * written against what the schema actually does, not against what a policy
 * template usually says, so every claim below is checkable in
 * supabase/migrations. If the schema changes, this changes.
 *
 * Two rules it holds to:
 *   · §3.3 — never "encrypted", "anonymous" or "guaranteed" UNLESS LITERALLY
 *     TRUE. Encryption in transit and at rest is a fact and is stated as one;
 *     a bare "encrypted" would imply the E2EE that Decision #29 puts out of
 *     v1. Enforced by a unit test that requires a denial or a qualification.
 *   · plain language (§7.1). No defined terms, no "processing activities",
 *     nothing that needs a second reading.
 */

import { BRAND } from "./brand";

export const PRIVACY_POLICY_EFFECTIVE = "2026-08-14";

/** Where §9.1's consent screen links. Kept here so the anchor cannot drift. */
export const HEALTH_DATA_ANCHOR = "health-data";

export interface PolicySection {
  readonly id: string;
  readonly title: string;
  /** Paragraphs. Rendered in order. */
  readonly body: readonly string[];
  /** Optional bullet list, rendered after the body. */
  readonly list?: readonly string[];
}

export const PRIVACY_POLICY_INTRO =
  "This explains what Plus One stores, what it never stores, who can see it, and how to delete all of it. It is written to be read once and understood. If anything here is unclear, that is a problem with the writing and we want to hear about it.";

export const PRIVACY_POLICY: readonly PolicySection[] = [
  {
    id: "what-we-store",
    title: "What we store",
    body: [
      "Only what the app needs to work. There is no analytics profile of you being built in the background.",
    ],
    list: [
      "Your phone number, used to sign you in.",
      "An email address, if you choose to add one. It signs you in with a code, and carries notifications if you switch them on for it — the same deliberately vague ones described below, never anything more. It is never shown to other members.",
      "The name you choose to display. It does not have to be your legal name, and we never ask for one.",
      "Your date of birth. Other members see an age, never the date.",
      "Your community and condition type, and the U=U badge if you turn it on.",
      "What you are looking for, and whether you are in dating or support-only mode.",
      "An approximate location, rounded to about a kilometre before it is saved. Other members see a distance, never a point on a map.",
      "Your photos, prompts, bio, and search radius.",
      "Whether you are verified, and when.",
      "Your messages, and the connects you send and receive.",
    ],
  },
  {
    id: "what-we-never-store",
    title: "What we never store",
    body: [
      "These are not settings you have to find and switch off. There is no column in our database for any of them.",
    ],
    list: [
      "Your legal name. Our payment processor holds one if you subscribe; our own database never does.",
      "Medical records, test results, lab values, diagnosis dates, or any medical history.",
      "Free text about your condition. The only options are the ones in the list.",
      "Your exact location.",
      "Your verification selfie, once the check has finished. See below.",
      "Advertising or tracking identifiers. There are no third-party ad or analytics pixels in this app.",
    ],
  },
  {
    id: HEALTH_DATA_ANCHOR,
    title: "Health data",
    body: [
      "Your community, your condition type, and your optional U=U badge are health data, and we treat them that way.",
      "We ask for them on their own screen, with their own checkbox, and we store the date you agreed along with the exact wording you agreed to. If we ever change that wording, we ask again rather than assuming the old answer still stands.",
      "We use this only to run matching and the community rooms. We do not sell it. We do not share it with advertisers, data brokers, or anyone building a profile of you. No third party receives it in exchange for money or anything else of value.",
      "You can change your community or condition type at any time, and you can delete everything permanently at any time.",
      "We apply this standard everywhere, to everyone, rather than only where a particular law requires it. That includes the protections in Washington's My Health My Data Act and Nevada's consumer health data law.",
    ],
  },
  {
    id: "who-can-see-what",
    title: "Who can see what",
    body: [
      "Your profile is visible to verified members in your own community, inside your distance range. Members in support-only mode are not visible to members browsing for dating.",
      "This is enforced in the database itself, not in the app. A bug in a screen cannot show your profile to someone who should not see it, because the rule is applied before the data ever reaches a screen.",
      "If you choose blurred photos, they are blurred before they are sent to anyone you have not connected with — not blurred in the browser afterwards.",
      "Blocking is mutual and immediate: a blocked member cannot see you, and you cannot see them.",
    ],
  },
  {
    id: "verification",
    title: "Verification",
    body: [
      "Everyone here verifies a phone number and passes an automated selfie check. That is the whole point of the place: every profile is a real person.",
      "The selfie is sent to an identity verification provider, checked, and then deleted. We keep whether it passed and when — nothing else. The provider scores its own confidence and that score decides the outcome, but it is not written down. We do not keep the image, and we never show it to anyone.",
      "If the automated check cannot make a decision, a member of our team reviews it. You can always appeal a decision, and appealing never requires passing the check you are appealing.",
    ],
  },
  {
    id: "messages",
    title: "Messages",
    body: [
      "Messages are private between you and the person you are talking to. They are not scanned to target you with anything, and they are not used to train anything.",
      "They are encrypted in transit and encrypted at rest, and the same database rules that protect everything else protect them too.",
      "They are not end-to-end encrypted, and we would rather say so than let you assume otherwise. That means we could read them if we were compelled to, or if we went looking. The reason is moderation: if you report a message, a human has to be able to read it, and that is not possible in a system where we hold no key. We think being able to act on reports matters more here than the stronger guarantee, and you deserve to know which trade we made.",
      "If you report someone, the moderators reviewing the report can see the messages you reported.",
    ],
  },
  {
    id: "text-messages",
    title: "Text messages",
    /**
     * Required, and written to be true rather than to satisfy a form.
     *
     * DO NOT DELETE THIS BECAUSE WE NO LONGER REGISTER AN A2P CAMPAIGN.
     *
     * It was written for A2P 10DLC campaign review, which requires the linked
     * privacy policy to state three things: that mobile numbers are not shared,
     * how often messages are sent, and that message and data rates may apply.
     * We send through Twilio Verify now, which is exempt from that registration
     * — but the registration was never the reason these have to be true. The
     * TCPA and the CTIA guidelines require express consent, a disclosure of
     * frequency and rates, and a working STOP, from anyone sending an automated
     * text to a US mobile number. Verify changes who registers with the
     * carriers. It does not change consent law.
     *
     * The last paragraph is the one a template would not include: on an app
     * where the only way in is a texted code, opting out of texts means losing
     * the account. Saying so is the difference between a disclosure and a
     * formality.
     */
    body: [
      "We text you a one-time code when you sign in. That is the only thing we ever text you — no marketing, no reminders, no announcements.",
      "How often: only when you ask for one. For most people that is once, when they first join, and again if they sign in on a new phone. You can add an email in your settings and get the code there instead.",
      "Message and data rates may apply.",
      "We never sell your mobile number, and we never share it with anyone for their own marketing. It goes to the messaging provider that delivers your code, in order to deliver your code, and nowhere else.",
      "You can reply STOP to any message to stop receiving them. If you have added an email to your account, you can still sign in with a code sent there. If you have not, a text is the only way in — so replying STOP would leave you unable to sign in, which is closer to closing the door than to turning off a notification. Reply START if you change your mind.",
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    body: [
      "Every notification we send is deliberately vague. A push notification says someone sent you a message, never who or what. Emails all carry the same subject line and say nothing on the outside.",
      "No notification, email subject, or link we send contains any word about a condition. Someone glancing at your lock screen learns nothing.",
    ],
  },
  {
    id: "payments",
    title: "Payments",
    body: [
      "Payments are handled by Stripe. Card details never reach us.",
      "Stripe holds your legal name and billing details because a payment processor has to. Our database never receives them — it stores only that a subscription exists and when it renews.",
    ],
  },
  {
    id: "who-else-touches-it",
    title: "Who else touches your data",
    body: ["As few companies as we can manage, each doing one job:"],
    list: [
      "Our hosting and database provider, which stores the data described above.",
      "A messaging provider, which sends the sign-in code to your phone.",
      "An identity verification provider, which checks your selfie and then deletes it.",
      "Stripe, for payments.",
      "An email provider, for transactional email.",
      "Your browser's push service — Google, Apple or Mozilla, depending on which browser you use — which carries a notification to your device. It sees that one was sent and to which device, never what it says: the contents are encrypted with a key only your browser holds.",
    ],
  },
  {
    id: "logs",
    title: "Logs and diagnostics",
    body: [
      "We keep error logs so the app can be fixed when it breaks. Those logs identify accounts by an opaque id. Message contents and profile fields are stripped before anything is recorded, and no condition information appears in any event we log.",
    ],
  },
  {
    id: "deletion",
    title: "Deleting everything",
    body: [
      "You can delete your account from Settings. It is permanent and we mean it literally.",
      "Within seven days, your profile, photos, messages, connects, and every other row belonging to you are removed from our database and our file storage, and any subscription is cancelled. This is a deletion, not a flag that hides you while the data stays.",
      "Your verification selfie is already gone by then — it is deleted as soon as the check finishes, whether or not you ever delete your account.",
    ],
  },
  {
    id: "your-choices",
    title: "Your choices",
    body: [
      // The §9.4 JSON self-export is NOT built, and it is second in the §10 cut
      // order — so a policy promising it is promising something that may never
      // ship. Restore "export a copy of your data as a file," to this sentence
      // when the export exists, and not before. A guard test keeps it out until
      // then. A privacy policy is the one document that cannot describe
      // intentions.
      "You can change or withdraw your health-data consent, switch to support-only mode, turn off optional notifications, or delete everything. Withdrawing health-data consent means we can no longer run matching for you, so it deletes your account.",
      "You do not have to give a reason for any of this, and using any of it will never get you treated differently.",
    ],
  },
  {
    id: "children",
    title: "Age",
    body: [
      "Plus One is for adults. You have to be 18 or over, and the app enforces that at sign-up.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: [
      "If we change how we handle health data, we ask for your consent again rather than quietly updating this page. For other changes, we will tell you in the app before they take effect.",
    ],
  },
  /**
   * The section this policy went without.
   *
   * Fourteen sections described what is stored, who can see it and how to
   * delete it, and none of them said how to ask anybody anything. A policy that
   * grants rights over your own data and then gives no way to exercise them is
   * the one part of it that cannot be checked against the schema.
   *
   * Built from BRAND rather than written out, so the operating entity and the
   * address cannot drift from the values the rest of the app uses.
   */
  {
    id: "contact",
    title: "How to reach us",
    body: [
      `${BRAND.name} is operated by ${BRAND.legalName}.`,
      `For anything in this policy — a question, a correction, or a request about the data held on you — write to ${BRAND.supportEmail}.`,
      'You do not need to write to anyone to delete your account. It is a button in Settings, and "Deleting everything" above describes exactly what it removes.',
    ],
  },
] as const;
