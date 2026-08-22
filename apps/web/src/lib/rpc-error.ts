/**
 * What a member is allowed to read from a database error.
 *
 * Eight call sites returned `error.message` straight to the UI. Every message
 * reachable today happens to be about the caller or about a chat they are in,
 * so nothing leaks right now — but the one that would is already written:
 * `create_connect` raises "connect: target is support-only", and
 * connect/[id]/actions.ts swallows it by hand for exactly that reason. One
 * hand-rolled exception is not a rule, and the next RPC message nobody thinks
 * about arrives on a screen.
 *
 * So this inverts the default. A message is shown only if it is on the safe
 * list; everything else becomes the caller's own fallback. rpc-error.test.ts
 * reads the migrations and fails on any `raise exception` text that is on
 * neither list, so a new one has to be classified before it can ship.
 */

/**
 * Messages a member may read verbatim: they describe the caller's own state, a
 * chat they are already in, or a rule they just hit themselves.
 *
 * Matched as prefixes, because several are formatted with a value — "chat is %"
 * arrives as "chat is closed_fuse", and "intention can change again on %" as a
 * date the member genuinely needs.
 */
const SAFE_PREFIXES: readonly string[] = [
  "a plan needs a date",
  // Slow mode. Tells the member exactly how long is left, which is the whole
  // point of raising it rather than silently dropping the post.
  "slow mode: wait ",
  // The appeal refusals (Decision #21). Both are about the member's own
  // situation and both are actionable by them, so they are safe to show — and
  // openAppeal maps them to reviewed copy rather than passing them through raw.
  "an appeal is already open",
  "no review to appeal",
  "chat is ",
  "connect is already ",
  "connect: daily budget exhausted",
  "connect: initiator is not verified",
  "connect: weekly support budget exhausted",
  "dating re-entry is available on ",
  "intention can change again on ",
  "no confirmed plan to cancel",
  "no plan to confirm",
  "not a participant",
  "only the recipient may ",
  "the other person still needs to confirm this plan",
];

/**
 * Messages that must never reach a member.
 *
 * The first three are the interesting ones: they answer a question about
 * SOMEBODY ELSE — their mode, their community, their room membership — which is
 * the same probe leak 20260814001000 closed at the function-grant level, just
 * arriving as text. The rest are internal and say nothing a member can act on.
 *
 * Listed rather than inferred so the test can tell "deliberately withheld" from
 * "nobody has looked at this yet".
 */
const INTERNAL_PREFIXES: readonly string[] = [
  "connect: target is support-only",
  "connect: target is not visible to initiator",
  "connect: both members must belong to the room",
  "connect: profile not found",
  "connect: support-only outbound requires a shared room",
  "no such member",
  // Admin-only paths. A member can never call the RPCs that raise these, and
  // none of them describes anything a member did.
  "no such reward",
  "that reward is already decided",
  "a referral grant is for the referrer or the invitee",
  "profile not found",
  "connect not found",
  "member is not under review",
  "not an administrator",
  "not authenticated",
  // Never reaches a signed-in member by construction, and says nothing useful
  // to anyone else.
  "not signed in",
  "a reason of at least 10 characters is required",
  "a report is resolved or dismissed",
  "no open report with that id",
  // The browser hands register_push_device an endpoint it got from the push
  // service. An empty one is our bug, not the member's, and there is nothing
  // they could do about it — the permission prompt has already been answered by
  // the time this could fire.
  "a device needs an address",
  // The browser reports its own zone and nothing shows the result to anybody —
  // a refusal here means a spoofed or mangled value, which is a bug rather than
  // something a member did.
  "not a timezone",
  // The notification switches. Both are unreachable through the UI — the grid
  // renders one checkbox per NOTIFICATION_CHANNELS entry, and
  // verification_decided has no row at all because it is not in MUTABLE_EVENTS
  // — so either one arriving means the screen and the database disagree about
  // what exists. That is ours to fix, and "That didn't save" is what the member
  // is shown.
  "no such channel",
  "that one cannot be turned off",
  "config values are numbers or objects",
  "unknown config key: ",
  // The pinned resource card, which only an admin can set. Every one of these
  // is a malformed write from the admin screen, and that screen has its own
  // copy for them — a member never reaches this RPC at all.
  "not permitted",
  "no such room",
  "a pinned card is an object",
  "a pinned card needs a title and a body",
  "a pinned card url must be https",
  // block_room_message_author, when the post is not one the caller can see.
  // Only a forged or stale id produces it, and BlockButton shows its own copy —
  // saying "no such post" back would confirm to a prober that other ids do
  // exist, which is the oracle the check was written to close.
  "no such post",
  // enforce_flat_comments. The UI offers no reply control on a comment, so only
  // a forged insert reaches this — and "a reply cannot be replied to" describes
  // the schema rather than anything the member did.
  "a reply cannot be replied to",
  // The news screen, which only an admin reaches. Both describe a malformed
  // write from that screen, and it shows its own copy for them — a member
  // never calls these RPCs at all.
  "an article needs a headline",
  "no such article",
  // share_post_to_room. Both describe a share the UI does not offer — it lists
  // only rooms the member is in, and refuses an article already there — so
  // only a forged call reaches either.
  "already shared there",
  "not in that room",
  // Their predecessors, from before articles became posts. The functions are
  // dropped; the migration that raised them is history and the scanner reads
  // history.
  "a news item needs a title",
  "no such news item",
  "could not allocate a referral code",
  // record_drop refuses a backdated date. Only a forged call can produce it —
  // the app always sends today — so it says nothing a member needs.
  "a drop is for today",
  // record_drop's own bounds. Only a forged call can produce any of them — the
  // app sends the Drop it just assembled — so none says anything a member needs.
  "a drop is at most ",
  "a drop card must be someone you can see",
  "a referral grant is for a conversion or a tier",
  // reorder_photos' bounds. The gallery always sends the member's complete,
  // de-duplicated order, so only a forged call reaches any of them — and
  // "that is not your photo" in particular answers a question about somebody
  // else's row, which is exactly the kind of text this list exists to keep off
  // a screen. reorderPhotos returns its own message.
  // set_my_location's bound. The member never sees it: the action only calls
  // the RPC with finite numbers, and a browser that returns a coordinate off
  // the globe is a broken browser rather than something anyone can act on.
  "that is not a place",
  "nothing to reorder",
  "the same photo cannot appear twice",
  "that is not the whole set",
  "that is not your photo",
  "% is not callable by a member",
  "policies call an is_admin overload that end users cannot execute: ",
  "policies still calling is_admin(uuid): ",
];

export { SAFE_PREFIXES, INTERNAL_PREFIXES };

/** Whether this exact message text is one a member may read. */
export function isMemberFacing(message: string): boolean {
  const text = message.trim();
  return SAFE_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/**
 * The string to show for a failed RPC.
 *
 * `fallback` is the caller's own copy, so each screen says something that makes
 * sense where it is rather than sharing one apologetic sentence.
 */
export function memberFacingError(
  error: { readonly message?: string | null } | null | undefined,
  fallback: string,
): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  return isMemberFacing(message) ? message : fallback;
}
