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
  "config values are numbers or objects",
  "unknown config key: ",
  "could not allocate a referral code",
  // record_drop refuses a backdated date. Only a forged call can produce it —
  // the app always sends today — so it says nothing a member needs.
  "a drop is for today",
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
