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
import { notify } from "./notify";

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
  /**
   * Asked ON THE JOIN FORM now, and only of somebody who ticked the testing
   * box.
   *
   * The first shape asked for these later, on `/beta/<code>`, so that a store
   * identity was only ever held for somebody actually invited. The privacy
   * instinct was right and the sequencing was wrong: nobody can be added to a
   * Play or TestFlight list until they come back and fill in a SECOND form, so
   * every invitation became a round trip that might take days or never happen —
   * which is the exact delay the admin screen exists to remove.
   *
   * Conditional fields keep both. Somebody who does not tick the box is asked
   * nothing extra and no store identity is stored for them; somebody who does
   * has self-selected, and asking then is the one moment it is justified.
   */
  readonly storePlatform?: "ios" | "android" | null;
  readonly storeEmail?: string | null;
}

/**
 * Add an address, or quietly do nothing, and never say which.
 *
 * Returns void deliberately. See the oracle rule above.
 */
export async function joinWaitlist({
  email,
  metro,
  wantsBeta,
  storePlatform = null,
  storeEmail = null,
}: JoinInput): Promise<void> {
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
      .update({
        metro,
        wants_beta: wantsBeta,
        ...storeFields(wantsBeta, storePlatform, storeEmail),
        confirm_sent_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    await sendConfirmation(normalised, existing.token);
    return;
  }

  const token = mintToken();
  const { error } = await supabase.from("waitlist").insert({
    email: normalised,
    metro,
    wants_beta: wantsBeta,
    ...storeFields(wantsBeta, storePlatform, storeEmail),
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

/**
 * The store fields, and the clearing rule that goes with them.
 *
 * Untick the testing box and BOTH are nulled. Somebody who changes their mind
 * about testing has withdrawn the only reason we had for holding their Google
 * account or Apple ID, and keeping it because it is already in the row is how a
 * table quietly outgrows its justification.
 *
 * The mirror of the per-photo lapse rule: the safe direction here is holding
 * less, and it is the one that happens without anybody deciding.
 */
function storeFields(
  wantsBeta: boolean,
  platform: "ios" | "android" | null,
  storeEmail: string | null,
): { store_platform: string | null; store_account_email: string | null } {
  if (!wantsBeta) return { store_platform: null, store_account_email: null };
  const normalised = storeEmail?.trim().toLowerCase() || null;
  return { store_platform: platform, store_account_email: normalised };
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

  if (data) {
    const wantsBeta = Boolean(data.wants_beta);
    // Only on the transition, and only for a beta signup. This branch is the
    // one that just moved confirmed_at from null, so a second tap on the same
    // link — or a mail client prefetching it — cannot fire it again.
    if (wantsBeta) await alertAdminsOfBetaSignup();
    return { ok: true, wantsBeta };
  }

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

/**
 * Tell whoever runs the beta that somebody joined it.
 *
 * ── on CONFIRMATION, and only for a beta signup ─────────────────────────────
 *
 * Not at join. An unconfirmed row is somebody who never asked — possibly
 * somebody else's address typed by a stranger — and an alert on that is both
 * noise and a way to make this endpoint a nuisance generator. Confirmation is
 * the first moment a real person with a real mailbox has said yes.
 *
 * And only when `wants_beta`. Kevin asked for the beta specifically: a plain
 * waitlist signup is a number on a screen he looks at when he chooses to, where
 * a tester is somebody waiting on him to act.
 *
 * ── it names nobody ─────────────────────────────────────────────────────────
 *
 * See the template. The address is one tap away in /admin/waitlist, behind a
 * session and a roster check, which is where it belongs — an admin's lock
 * screen is still a lock screen.
 *
 * Never throws, like everything else that notifies: a courtesy attached to
 * something that already succeeded must not turn a confirmed signup into an
 * error the member sees. `notify()` already swallows, and the roster read is
 * wrapped for the same reason.
 */
async function alertAdminsOfBetaSignup(): Promise<void> {
  try {
    const { data } = await serviceClient().from("admin_users").select("user_id");
    const admins = (data ?? []).map((row) => row.user_id as string).filter(Boolean);
    if (admins.length === 0) return;
    await notify("beta_signup", admins);
  } catch (cause) {
    console.error(
      JSON.stringify({
        at: "waitlist.betaAlert",
        problem: cause instanceof Error ? cause.message : "unknown",
      }),
    );
  }
}

export interface Preferences {
  readonly metro: string;
  readonly wantsBeta: boolean;
  readonly confirmed: boolean;
  readonly invited: boolean;
  readonly storePlatform: "ios" | "android" | null;
  readonly storeEmail: string | null;
}

/** What we hold, for the person who holds the token. */
export async function waitlistPreferences(token: string): Promise<Preferences | null> {
  if (!token) return null;
  const { data } = await serviceClient()
    .from("waitlist")
    .select("metro, wants_beta, confirmed_at, invited_at, store_platform, store_account_email")
    .eq("token", token)
    .maybeSingle();

  if (!data) return null;
  return {
    metro: data.metro as string,
    wantsBeta: Boolean(data.wants_beta),
    confirmed: Boolean(data.confirmed_at),
    invited: Boolean(data.invited_at),
    storePlatform: (data.store_platform as "ios" | "android" | null) ?? null,
    storeEmail: (data.store_account_email as string | null) ?? null,
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
  changes: {
    metro?: string;
    wantsBeta?: boolean;
    storePlatform?: "ios" | "android" | null;
    storeEmail?: string | null;
  },
): Promise<void> {
  if (!token) return;

  const patch: Record<string, unknown> = {};
  if (changes.metro !== undefined && isMetro(changes.metro)) patch["metro"] = changes.metro;
  if (changes.wantsBeta !== undefined) {
    patch["wants_beta"] = changes.wantsBeta;
    // Same clearing rule as joining: untick and the store identity goes with
    // it, because the reason for holding it has gone with it.
    Object.assign(
      patch,
      storeFields(changes.wantsBeta, changes.storePlatform ?? null, changes.storeEmail ?? null),
    );
  }
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
  /**
   * One pass over the rows, then one over the metros.
   *
   * It was METROS.map(rows.filter(...)) with four more filters inside, so every
   * row was walked 5 times for each of 43 metros. Correct and fine at this size;
   * replaced because the shape is the kind that stops being fine quietly, and
   * the result is also simpler to read.
   *
   * Still returns EVERY metro, including the empty ones — the caller decides
   * what to hide, and a metro missing from this list would read as zero anyway.
   */
  // Mutable on purpose: MetroCount's fields are readonly, which is right for the
  // value handed out and wrong for the accumulator building it.
  type Tally = { confirmed: number; wantsBeta: number; invited: number; accepted: number };
  const tally = new Map<string, Tally>();
  for (const r of rows) {
    const t = tally.get(r.metro) ?? { confirmed: 0, wantsBeta: 0, invited: 0, accepted: 0 };
    t.confirmed += 1;
    if (r.wants_beta) t.wantsBeta += 1;
    if (r.invited_at) t.invited += 1;
    if (r.accepted_at) t.accepted += 1;
    tally.set(r.metro, t);
  }
  return METROS.map((m) => ({
    metro: m.id,
    label: m.label,
    ...(tally.get(m.id) ?? { confirmed: 0, wantsBeta: 0, invited: 0, accepted: 0 }),
  }));
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

/** What we already know, so the invite page does not ask twice. */
export async function storeAccountFor(
  code: string,
): Promise<{ platform: "ios" | "android"; email: string } | null> {
  const { data } = await serviceClient()
    .from("waitlist")
    .select("store_platform, store_account_email")
    .eq("invite_code", code)
    .maybeSingle();

  const platform = data?.store_platform;
  const email = data?.store_account_email;
  if ((platform !== "ios" && platform !== "android") || !email) return null;
  return { platform, email: email as string };
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
  stage: "to_add" | "invited" = "to_add",
): { addresses: string[]; missing: number } {
  /**
   * Keyed on CONFIRMED — every row here is, since `confirmedWaitlist` selects
   * on it — and deliberately NOT on invited.
   *
   * It required `accepted_at` once, then `invited_at`, and both were the wrong
   * way round for the order the operator actually works in. The store list has
   * to be populated BEFORE the invitation goes out: `BETA_INSTALL.android`
   * opens with "Nothing before this works", and the invitation email is what
   * tells somebody to go and install. Gating this on `invited_at` meant the
   * addresses could only be copied AFTER that email had been sent — so every
   * tester was told to install during the window before they were added, and
   * Play answers that with "unavailable" rather than a reason. Kevin hit it
   * with six people waiting.
   *
   * The old comment argued the other way: adding somebody to a Play track
   * before they have an invitation "lets them install an app they cannot then
   * sign into, which is a worse first impression than waiting." BACKLOG 23
   * settles that and was written later about this exact question — installing
   * is not joining, `/onboarding/phone` refuses to create an account without an
   * invitation, and "the account gate is the real wall and the store track was
   * never doing that work." So the cost it avoided is not a cost, and the one
   * it created is real.
   *
   * Still not open: confirmed, `wants_beta`, and a store account they gave us.
   * Nobody reaches a store list without having asked to test.
   */
  const wanted = rows.filter(
    (r) =>
      r.wants_beta &&
      r.store_platform === platform &&
      // `to_add` is a WORK QUEUE and shrinks as it is worked; `invited` is the
      // roster of who is already on the track. Splitting them is what stops the
      // paste box redisplaying people every time, but it also means the box is
      // now a PARTIAL list — see the note on the screen about adding rather
      // than replacing, which is a hazard this split introduced.
      (stage === "invited" ? Boolean(r.invited_at) : !r.invited_at),
  );
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
