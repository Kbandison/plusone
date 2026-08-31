import "server-only";

import { randomBytes } from "node:crypto";

import {
  DRAFT_COPY,
  METROS,
  WAITLIST_EMAIL,
  WAITLIST_INVITE_TTL_DAYS,
  WAITLIST_UNCONFIRMED_TTL_DAYS,
  isMetro,
  metroLabel,
  parseClientEnv,
} from "@plusone/config";

import { serviceClient } from "./cron";
import { sendDirectEmail } from "./email";

/**
 * Everything that touches `public.waitlist`.
 *
 * ── why the service client, everywhere in this file ─────────────────────────
 *
 * `waitlist` holds no RLS policies and is granted to neither `anon` nor
 * `authenticated`, so PostgREST cannot reach it at all. That is the design and
 * the migration header carries the full argument; the short version is that
 * there is no member behind a waitlist row, so "their own rows" has no meaning,
 * and a definer RPC callable by `anon` would return the confirmation token to
 * whoever called it — which would let anybody join with somebody else's address
 * and confirm it themselves.
 *
 * `lib/cron.ts` documents the service client's legitimate callers as "the cron
 * jobs and the Stripe webhook — paths that act across every member and have no
 * member behind them". This is a third of exactly that shape, and it is named
 * there now rather than added quietly.
 *
 * ── the oracle rule, which governs every return type below ──────────────────
 *
 * Nothing in this file may tell the browser whether an address is on the list.
 * A form that answers "already on the list" differently from "added" is a
 * membership oracle for an HSV and HIV app: anybody could test whether a
 * particular person signed up. /sign-in has the same property for the same
 * reason and got there first — see classifySendFailure.
 *
 * So `join` returns void. Not a boolean, not a status enum, not a thrown error
 * on conflict. The caller has nothing it could accidentally leak.
 */

/** 32 bytes, base64url. Never rendered on a page — it exists only in an email. */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Short enough to read aloud and long enough not to be guessed.
 *
 * Lowercase base36 rather than base64url because this one DOES appear in a URL
 * somebody might type from a phone screen, and because `plusone_beta` is
 * matched by a regex in proxy.ts that has to stay narrow.
 */
function mintInviteCode(): string {
  return randomBytes(8).toString("hex");
}

/** One confirmation per address per hour. The reasoning is in 20260831000200. */
const RESEND_AFTER_MS = 60 * 60 * 1000;

function appOrigin(): string {
  const { NEXT_PUBLIC_APP_URL } = parseClientEnv(process.env);
  return NEXT_PUBLIC_APP_URL;
}

/**
 * The footer every waitlist email carries.
 *
 * Not optional and not a nicety: Play requires a deletion route that works
 * without the app installed, and this is it for anybody who never installs
 * anything. It is also the thing that makes the confirmation email honest —
 * "ignore this" is only true if there is a way out that does not need us.
 */
function footer(token: string): string {
  // "Change or leave", not "unsubscribe". The same page does both, and naming
  // only the destructive half means somebody who just wanted to move city or
  // opt into testing takes the exit instead — the only door they were shown.
  return `\n\nChange your area, opt in or out of testing, or leave the list:\n${appOrigin()}/waitlist/manage?t=${encodeURIComponent(token)}\n`;
}

export interface JoinInput {
  readonly email: string;
  readonly metro: string;
  readonly wantsBeta: boolean;
}

/**
 * Add an address, or quietly do nothing, and never say which.
 *
 * Returns void deliberately. See the oracle rule above.
 */
export async function joinWaitlist({ email, metro, wantsBeta }: JoinInput): Promise<void> {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !isMetro(metro)) return;

  const supabase = serviceClient();

  // Read first so a repeat submission can be told apart from a new one WITHOUT
  // that difference reaching the caller. The decision is made here and stays
  // here.
  const { data: existing } = await supabase
    .from("waitlist")
    .select("id, token, confirmed_at, confirm_sent_at")
    .eq("email", normalised)
    .maybeSingle();

  if (existing) {
    // Already confirmed: nothing to send, nothing to say. Re-sending a
    // confirmation to somebody already on the list is the email bomb with extra
    // steps.
    if (existing.confirmed_at) return;

    const lastSent = existing.confirm_sent_at ? Date.parse(existing.confirm_sent_at) : 0;
    if (Date.now() - lastSent < RESEND_AFTER_MS) return;

    // A repeat join may correct the area — somebody who picked wrong and came
    // back. It may never change the address, which is the primary key of this
    // row in every sense that matters.
    await supabase
      .from("waitlist")
      .update({ metro, wants_beta: wantsBeta, confirm_sent_at: new Date().toISOString() })
      .eq("id", existing.id);

    await sendConfirmation(normalised, existing.token);
    return;
  }

  const token = mintToken();
  const { error } = await supabase.from("waitlist").insert({
    email: normalised,
    metro,
    wants_beta: wantsBeta,
    token,
    confirm_sent_at: new Date().toISOString(),
  });

  // A unique violation here is two submissions racing, which is a repeat join
  // and therefore silence. Any other error is ours and is logged without the
  // address.
  if (error) {
    if (error.code !== "23505") {
      console.error(JSON.stringify({ at: "waitlist.join", problem: error.code ?? "unknown" }));
    }
    return;
  }

  await sendConfirmation(normalised, token);
}

async function sendConfirmation(to: string, token: string): Promise<void> {
  const { subject, preview, body } = WAITLIST_EMAIL.confirm;
  const link = `${appOrigin()}/waitlist/confirm?t=${encodeURIComponent(token)}`;
  await sendDirectEmail({
    to,
    subject,
    text: `${preview}\n\n${body.join("\n\n")}\n\n${link}${footer(token)}`,
  });
}

export interface Confirmation {
  readonly ok: boolean;
  /** Which of the two things they signed up for. Null when the token is dead. */
  readonly wantsBeta: boolean | null;
}

/**
 * Confirm, and say WHICH list they are on.
 *
 * The first version returned a bare boolean, so the confirmation page showed
 * one sentence to everybody: "we will email you when Plus One opens in your
 * area". That is the waitlist promise. Somebody who ticked "I would try an
 * early build" got no acknowledgement that the tick registered, no idea they
 * were in a different queue, and no way to tell whether they had misclicked.
 *
 * The row is right here and knows the answer, so the page can say it.
 */
export async function confirmWaitlist(token: string): Promise<Confirmation> {
  if (!token) return { ok: false, wantsBeta: null };
  const supabase = serviceClient();

  const { data } = await supabase
    .from("waitlist")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("token", token)
    .is("confirmed_at", null)
    .select("wants_beta")
    .maybeSingle();

  if (data) return { ok: true, wantsBeta: Boolean(data.wants_beta) };

  // Already confirmed reads as success, not as a broken link. Somebody who taps
  // the same link twice — or whose mail client prefetched it — has not done
  // anything wrong and should not be told the link expired.
  const { data: already } = await supabase
    .from("waitlist")
    .select("wants_beta")
    .eq("token", token)
    .maybeSingle();

  return already
    ? { ok: true, wantsBeta: Boolean(already.wants_beta) }
    : { ok: false, wantsBeta: null };
}

export interface Preferences {
  readonly metro: string;
  readonly wantsBeta: boolean;
  readonly confirmed: boolean;
  readonly invited: boolean;
}

/** What we hold, for the person who holds the token. */
export async function waitlistPreferences(token: string): Promise<Preferences | null> {
  if (!token) return null;
  const { data } = await serviceClient()
    .from("waitlist")
    .select("metro, wants_beta, confirmed_at, invited_at")
    .eq("token", token)
    .maybeSingle();

  if (!data) return null;
  return {
    metro: data.metro as string,
    wantsBeta: Boolean(data.wants_beta),
    confirmed: Boolean(data.confirmed_at),
    invited: Boolean(data.invited_at),
  };
}

/**
 * Change the area, or change their mind about testing.
 *
 * ── the hole this fills, which was a real one ───────────────────────────────
 *
 * `joinWaitlist` returns early for an address that is already confirmed — it
 * must, or resubmitting the form is an email bomb aimed at whoever owns that
 * mailbox. The consequence nobody noticed: a CONFIRMED person could never
 * change anything. Somebody who did not tick "I would try an early build" and
 * then wanted to test had no path at all, and somebody who moved city had no
 * way to say so.
 *
 * Keyed on the token rather than on the address, so it needs no sign-in and
 * cannot be aimed at somebody else's row. Same proof as leaving.
 */
export async function updatePreferences(
  token: string,
  changes: { metro?: string; wantsBeta?: boolean },
): Promise<void> {
  if (!token) return;

  const patch: Record<string, unknown> = {};
  if (changes.metro !== undefined && isMetro(changes.metro)) patch["metro"] = changes.metro;
  if (changes.wantsBeta !== undefined) patch["wants_beta"] = changes.wantsBeta;
  if (Object.keys(patch).length === 0) return;

  await serviceClient().from("waitlist").update(patch).eq("token", token);
}

/**
 * Delete the row outright.
 *
 * Not a `left_at` flag. §9.3's hard-delete principle applies with more force
 * here than to a member: this person never had an account, and the only thing
 * we hold is the fact that they asked about an HSV and HIV app. A soft delete
 * would keep exactly that.
 */
export async function leaveWaitlist(token: string): Promise<void> {
  if (!token) return;
  await serviceClient().from("waitlist").delete().eq("token", token);
}

export interface WaitlistRow {
  readonly id: string;
  readonly email: string;
  readonly metro: string;
  readonly wants_beta: boolean;
  readonly confirmed_at: string | null;
  readonly invited_at: string | null;
  readonly accepted_at: string | null;
  readonly store_platform: string | null;
  readonly store_account_email: string | null;
  readonly created_at: string;
}

/** Admin. Confirmed rows only — an unconfirmed address is somebody who never asked. */
export async function confirmedWaitlist(): Promise<WaitlistRow[]> {
  const { data } = await serviceClient()
    .from("waitlist")
    .select(
      "id, email, metro, wants_beta, confirmed_at, invited_at, accepted_at, store_platform, store_account_email, created_at",
    )
    .not("confirmed_at", "is", null)
    .order("created_at", { ascending: true });
  return (data ?? []) as WaitlistRow[];
}

export interface MetroCount {
  readonly metro: string;
  readonly label: string;
  readonly confirmed: number;
  readonly wantsBeta: number;
  readonly invited: number;
  readonly accepted: number;
}

/** Every metro, including the empty ones — a zero is the answer to "not here yet". */
export function countByMetro(rows: readonly WaitlistRow[]): MetroCount[] {
  return METROS.map((m) => {
    const mine = rows.filter((r) => r.metro === m.id);
    return {
      metro: m.id,
      label: m.label,
      confirmed: mine.length,
      wantsBeta: mine.filter((r) => r.wants_beta).length,
      invited: mine.filter((r) => r.invited_at).length,
      accepted: mine.filter((r) => r.accepted_at).length,
    };
  });
}

/**
 * Issue invitations. Admin only; the caller checks `is_admin()`.
 *
 * Returns how many were sent rather than which, because a per-row result would
 * be a list of addresses on an admin screen for no operational gain — the
 * screen re-reads the table afterwards and shows state from the rows.
 */
export async function inviteFromWaitlist(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = serviceClient();

  const { data: rows } = await supabase
    .from("waitlist")
    .select("id, email, token, metro, confirmed_at, invited_at")
    .in("id", ids as string[]);

  /** Only the columns this loop reads. A WaitlistRow cast would be a lie — the
   *  select above does not fetch the rest, and the cast that claimed it did was
   *  caught by the compiler rather than by a null at runtime. */
  interface InviteCandidate {
    readonly id: string;
    readonly email: string;
    readonly token: string;
    readonly confirmed_at: string | null;
    readonly invited_at: string | null;
  }

  let sent = 0;
  for (const row of (rows ?? []) as InviteCandidate[]) {
    // Never invite an unconfirmed address. It is the whole point of confirming.
    if (!row.confirmed_at) continue;
    // Already invited: re-issuing would mint a second code and orphan the
    // first, so somebody holding the original email would find a dead link.
    if (row.invited_at) continue;

    const code = mintInviteCode();
    const { error } = await supabase
      .from("waitlist")
      .update({ invite_code: code, invited_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("invited_at", null);
    if (error) continue;

    const { subject, preview, body } = WAITLIST_EMAIL.invite;
    const link = `${appOrigin()}/beta/${code}`;
    const ok = await sendDirectEmail({
      to: row.email,
      subject,
      text: `${preview}\n\n${body.join("\n\n")}\n\n${link}${footer(row.token)}`,
    });
    if (ok) sent += 1;
  }
  return sent;
}

/**
 * Is this code good for creating one account?
 *
 * Called from the onboarding action on every send, so it is the gate rather
 * than a hint. Deliberately says nothing about WHY a code failed — expired,
 * spent and never-existed are one answer, because the screen it feeds is shown
 * to somebody who may have been forwarded a link by a stranger.
 */
export async function betaInviteIsOpen(code: string | undefined): Promise<boolean> {
  if (!code) return false;
  const { data } = await serviceClient()
    .from("waitlist")
    .select("invited_at, accepted_at")
    .eq("invite_code", code)
    .maybeSingle();

  if (!data?.invited_at || data.accepted_at) return false;

  const ageMs = Date.now() - Date.parse(data.invited_at);
  return ageMs <= WAITLIST_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Spend the invitation, once the account it authorised actually exists.
 *
 * Called AFTER the OTP verifies, not before. An invitation consumed by somebody
 * who then abandoned the form at the code screen is an invitation burned for
 * nothing, and the person it was sent to would have to ask for another.
 *
 * `.is("accepted_at", null)` makes the spend atomic: two devices racing the
 * same link produce one account, and the second update matches no row.
 */
export async function acceptBetaInvite(code: string | undefined): Promise<void> {
  if (!code) return;
  await serviceClient()
    .from("waitlist")
    .update({ accepted_at: new Date().toISOString() })
    .eq("invite_code", code)
    .is("accepted_at", null);
}

/** Record which store account a tester will install with. Their choice, after accepting. */
export async function recordStoreAccount(
  code: string,
  platform: "ios" | "android",
  storeEmail: string,
): Promise<void> {
  const normalised = storeEmail.trim().toLowerCase();
  if (!normalised) return;
  await serviceClient()
    .from("waitlist")
    .update({ store_platform: platform, store_account_email: normalised })
    .eq("invite_code", code);
}

/**
 * The tester lists, in the form each console actually wants.
 *
 * Play takes a comma-separated list of Google account addresses; App Store
 * Connect takes them one per line. Both are pasted by hand, so the format is
 * the deliverable — a screen that shows a table and makes somebody retype it
 * has not saved anybody anything.
 */
export function testerList(
  rows: readonly WaitlistRow[],
  platform: "ios" | "android",
): { addresses: string[]; missing: number } {
  const wanted = rows.filter((r) => r.wants_beta && r.accepted_at && r.store_platform === platform);
  return {
    addresses: wanted.map((r) => r.store_account_email).filter((e): e is string => Boolean(e)),
    // Testers who accepted and never told us which account they install with.
    // Named as a count so the screen can say the list is short rather than
    // looking complete.
    missing: wanted.filter((r) => !r.store_account_email).length,
  };
}

/** Unconfirmed rows older than the TTL. Called by the purge cron. */
export async function sweepUnconfirmed(): Promise<number> {
  const cutoff = new Date(
    Date.now() - WAITLIST_UNCONFIRMED_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data } = await serviceClient()
    .from("waitlist")
    .delete()
    .is("confirmed_at", null)
    .lt("created_at", cutoff)
    .select("id");
  return (data ?? []).length;
}

/** Re-exported so a page does not have to import from two places to render one row. */
export { metroLabel, DRAFT_COPY };
