/**
 * Bug reports and feature requests, from the people using the thing.
 *
 * ── this is not `reports`, and the distance is deliberate ───────────────────
 *
 * `public.reports` is MODERATION: an accusation about another member, read
 * under a duty of care, whose subject must never learn who filed it. This is
 * about the software. It is attributed on purpose so we can reply, it has no
 * subject to protect, and putting "the photo grid scrolls wrong" into a queue
 * somebody is reviewing abuse in would be bad for both jobs.
 *
 * The migration header for 20260831000300 has the full argument for keeping the
 * two tables apart, including why merging them later would settle on the weaker
 * permission shape of the two.
 *
 * ── private, not a public board ─────────────────────────────────────────────
 *
 * The obvious alternative is a public roadmap where people post and upvote, and
 * it is genuinely better at prioritising. It is refused here for one reason:
 * a public feature request carries a name, and a name on a board belonging to
 * an HSV and HIV app is a disclosure the person did not set out to make. The
 * upvote signal is not worth it, and an anonymised board is a different product
 * with its own moderation problem.
 *
 * What replaces it is that a member can see their own reports and what happened
 * to them, which is most of what a public board is actually for from where they
 * are standing.
 */

export type FeedbackKind = "bug" | "idea" | "other";
export type FeedbackStatus = "new" | "seen" | "done" | "declined";

export interface FeedbackKindOption {
  readonly id: FeedbackKind;
  readonly label: string;
  /** What to write, because "describe your issue" gets "it doesn't work". */
  readonly prompt: string;
}

export const FEEDBACK_KINDS: readonly FeedbackKindOption[] = [
  {
    id: "bug",
    label: "Something is broken",
    prompt:
      "What did you do, what happened, and what did you expect instead? If it happens every time, say so — that is the most useful sentence in any bug report.",
  },
  {
    id: "idea",
    label: "Something is missing",
    prompt:
      "What would you want it to do, and what are you trying to get done? The second half is the more useful one — it often has an answer we had not thought of.",
  },
  {
    id: "other",
    label: "Something else",
    prompt: "Anything at all. Confusing wording counts, and so does something that felt wrong.",
  },
];

/**
 * What each status means to the MEMBER, not to us.
 *
 * A tracker whose only terminal state is "done" either lies or grows a backlog
 * nobody closes, so `declined` exists and says so plainly rather than leaving
 * somebody watching a report that will never move. Being told no is a better
 * outcome than being ignored, and it costs one word.
 */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Sent",
  seen: "We have read it",
  done: "Done",
  declined: "Not planned",
};

export const FEEDBACK_BODY_MAX = 2000;

/**
 * The context attached to every report, and the promise made about it.
 *
 * Shown to the member before they send — never captured silently. It is three
 * facts about the software and none about them, and the surest way to make that
 * true is to let them read it.
 *
 * `page` is the route SHAPE and never the path. `/app/chats/3f2a…` identifies a
 * conversation, and a conversation here is two people and a diagnosis;
 * `/app/chats/[id]` says exactly as much about where the bug is and nothing
 * about who was in it. Stripped in lib/feedback.ts, refused by a CHECK
 * constraint, and pinned by a test that plants a uuid.
 */
export const FEEDBACK_CONTEXT_NOTE =
  "Sent with this: which screen you were on, which version of the app, and whether you are in a browser or an installed app. Nothing else — no message, no profile, and nothing about who you are beyond the account this is sent from.";

/**
 * Where somebody who cannot sign in is meant to go.
 *
 * The form needs a session, which makes it useless for the report most worth
 * having during a beta — "I cannot get in". Naming an address is the whole fix
 * and it costs a line.
 */
export const FEEDBACK_FALLBACK_EMAIL = "support@loveplusone.app";
