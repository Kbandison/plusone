"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, metroCentroid } from "@plusone/config";
import { verification } from "@plusone/logic";

import { cookies } from "next/headers";

import { serviceClient } from "@/lib/cron";
import { getServerSupabase } from "@/lib/supabase";
import type { PhoneState } from "./state";
import { nextRoute } from "@/lib/onboarding";
import { acceptBetaInvite, metroForInvite } from "@/lib/waitlist";

const E = DRAFT_COPY.phone.errors;

/**
 * Supabase Auth is the identity provider — it mints the session, so the OTP
 * round trip has to go through it rather than through our own stub. What the
 * stub in `packages/logic/verification` is for is the pure part: E.164
 * validation and expiry, which are testable without a provider at all.
 *
 * Until the Twilio provider is configured in the Supabase dashboard, `send`
 * fails. That is reported as a setup problem on our side rather than as
 * something the member did wrong, because it is.
 */
export async function sendCode(_previous: PhoneState, formData: FormData): Promise<PhoneState> {
  const raw = String(formData.get("phone") ?? "").trim();
  if (!raw) return { error: E.phoneRequired, sentTo: null };

  // Strips the punctuation people type; refuses to invent a country code,
  // because guessing one sends someone's code to a stranger.
  const phone = verification.normalizePhone(raw);
  if (!phone) return { error: E.phoneInvalid, sentTo: null };

  /**
   * The one call in the app that can bring an account into existence.
   *
   * ── the gate that used to be here ──────────────────────────────────────────
   *
   * Between 2026-08-31 and 2026-09-13 this passed `shouldCreateUser: invited`,
   * and that was the closed beta. The reasoning is worth keeping because it is
   * what makes reopening safe to do in one line:
   *
   * The gate was on CREATION, never on signing in. `/sign-in` passes
   * `shouldCreateUser: false` on both branches — "this screen can never mint an
   * account" — so it was already closed to non-members, and gating it a second
   * time would only have broken its anti-enumeration property. "Nobody outside
   * the beta gets in" was implemented as "no account can be CREATED without an
   * invitation", which is why an existing member, or a store reviewer, could
   * always sign in regardless. Nothing about that changes by opening it; the
   * refusal branch simply stops being reachable.
   *
   * ── what the cookie still does ─────────────────────────────────────────────
   *
   * It is no longer a key. It is still a MARK: `verifyCode` spends the
   * invitation so it cannot be passed round, and stamps `joined_in_beta` on the
   * profile, which is the only record of who arrived during the beta and is
   * unrecoverable afterwards — an email on a list and an account keyed by
   * phone, with nothing joining them. BACKLOG 29.
   */
  // OPEN, since 2026-09-13. The closed beta gated account creation on an
  // invitation; Kevin reopened signups with counsel review still outstanding,
  // which is his call and is recorded in BACKLOG 22.
  //
  // The cookie is still READ, below and in verifyCode — an invitation that was
  // already issued still marks its cohort through `joined_in_beta`, and still
  // gets spent so it cannot be handed round. What stopped is refusing anybody
  // who does not have one.
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true },
  });

  if (error) {
    // The same classifier /sign-in uses, rather than a regex over the provider's
    // own words. Twilio rejects a number it cannot route (error 60200) before
    // sending anything, and that arrives as `sms_send_failed` — for which "try
    // again in a moment" is advice that can never work.
    switch (verification.classifySendFailure(error.code)) {
      case "not_configured":
        return { error: E.notConfigured, sentTo: null };
      case "rate_limited":
        return { error: E.rateLimited, sentTo: null };
      case "undeliverable":
        return { error: E.undeliverable, sentTo: null };
      // `pretend_sent` is Supabase refusing to create an account, which needs
      // `shouldCreateUser: false` — and this screen now passes true. So the
      // branch is unreachable again, as it was before the gate, and it is kept
      // rather than deleted because the classifier still has the case and a
      // switch that silently falls through is worse than one that answers.
      //
      // Treated as an ordinary send failure: if Supabase ever does refuse here,
      // "that did not send" is true and actionable, where the closed-beta card
      // would be a lie about a beta that has ended.
      case "pretend_sent":
        return { error: E.sendFailed, sentTo: null };
      case "failed":
        return { error: E.sendFailed, sentTo: null };
    }
  }

  return { error: null, sentTo: phone };
}

export async function verifyCode(previous: PhoneState, formData: FormData): Promise<PhoneState> {
  const phone = previous.sentTo;
  if (!phone) return { error: E.phoneRequired, sentTo: null };

  const token = String(formData.get("code") ?? "").trim();
  if (!token) return { error: E.codeRequired, sentTo: phone };

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  // Wrong code and expired code are deliberately one message. Distinguishing
  // them tells someone guessing which half they got right.
  if (error) return { error: E.codeInvalid, sentTo: phone };

  /**
   * Spend the invitation, now that the account it authorised actually exists.
   *
   * AFTER the OTP, never before. Marking it accepted at send time would burn an
   * invitation for anybody who reached the code screen and stopped — a mistyped
   * number, a text that never arrived, a closed tab — and they would have to
   * ask for another one that nothing in the product can issue.
   *
   * Not awaited for its result and not allowed to fail the signup: the account
   * is made either way, and refusing a verified member their session because a
   * bookkeeping update failed would be the worst possible trade. The cost of
   * missing it is one invitation reusable once more, which the TTL still bounds.
   */
  const betaCode = (await cookies()).get("plusone_beta")?.value;
  await acceptBetaInvite(betaCode);

  // Record on the profile what the OTP just proved.
  //
  // Nothing did this, and the two halves of the app disagreed about it: the
  // onboarding resolver reads auth.users.phone_confirmed_at, while the liveness
  // step reads profiles.verification_status. So every member reached the
  // liveness screen with a profile still marked 'unverified', start_liveness
  // refused with phone_not_verified, and the action reported "unavailable" —
  // which is why liveness had never worked for anyone and looked like a
  // provider problem.
  //
  // Service client because verification_status is no longer in the members'
  // update grant (20260815000800). The condition is the guard: this only ever
  // moves someone off 'unverified', so it can never walk a verified, flagged or
  // rejected member backwards.
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    // The result is checked. It was discarded, and this write is what unlocks
    // step 2 — if it failed, the OTP had still succeeded, so phone_confirmed_at
    // was set, the resolver advanced the member to liveness, and the liveness
    // step read verification_status = 'unverified' and refused with a message
    // about the phone. A member bounced between two screens, each blaming the
    // other, with nothing to press.
    //
    // A zero-row result is NOT a failure: the .eq('unverified') guard means a
    // member who is already phone_verified matches nothing, which is correct
    // and idempotent.
    const { error: promoteError } = await serviceClient()
      .from("profiles")
      .update({ verification_status: "phone_verified" })
      .eq("id", auth.user.id)
      .eq("verification_status", "unverified");

    if (promoteError) {
      console.error(JSON.stringify({ at: "phone.verify", problem: promoteError.message }));
      return { error: E.sendFailed, sentTo: phone };
    }

    // Mark the beta cohort, in a SEPARATE write that is allowed to fail.
    //
    // Not folded into the update above, and that is the whole point. Code
    // reaches production before the schema does here as a matter of course —
    // migrations are applied by hand and are Kevin's call — and PostgREST does
    // not fail narrowly on an unknown column, it fails the WHOLE request. Naming
    // joined_in_beta in the promote write would mean that until the migration
    // lands, verification_status is never set for anybody, every new member is
    // bounced between the phone and liveness screens, and the cause is a column
    // that has nothing to do with either. HANDOFF.md has that exact failure,
    // dated 2026-08-29.
    //
    // So: the critical write stays as it was, and this one is bookkeeping that
    // may lose a row. The condition is the same `unverified` guard, which is
    // what keeps it to accounts being created right now — an existing member who
    // still has an invitation cookie is signing IN, not joining, and is not part
    // of the cohort.
    if (betaCode) {
      const { error: cohortError } = await serviceClient()
        .from("profiles")
        .update({ joined_in_beta: true })
        .eq("id", auth.user.id)
        .eq("verification_status", "phone_verified")
        .eq("joined_in_beta", false);

      // Logged, never returned. The account exists and the member is signed in;
      // refusing them their session because a cohort flag did not land would be
      // the worst possible trade, and it is the same reasoning acceptBetaInvite
      // above is written with.
      if (cohortError) {
        console.error(JSON.stringify({ at: "phone.cohort", problem: cohortError.message }));
      }

      /**
       * Seed their location from the metro they told us on the waitlist.
       *
       * ── the two halves had never been connected ────────────────────────────
       *
       * `waitlist.metro` is a value somebody picked from a dropdown;
       * `profiles.location` is whatever their browser reported at the radius
       * step. Nothing in onboarding had ever read the waitlist, so a member who
       * refused the location prompt finished signing up matching NOBODY — while
       * a row in another table said which city they had told us they were in.
       *
       * This is the one moment both halves are in hand: the invitation code is
       * still on the request and the account has just come into existence.
       *
       * ── a SEED, and only where there is nothing ────────────────────────────
       *
       * `.is("location", null)` is what makes this safe to run here. It cannot
       * overwrite a real position, and the radius step later overwrites THIS
       * with one the moment a browser gives it — so the ordering is: what they
       * claimed, then what their device measured, and never the other way.
       *
       * Nothing records which waitlist row it came from. WAITLIST_NEVER refuses
       * a user_id on that table because binding an address that merely ASKED
       * about an HSV and HIV app to a member account turns an inference into a
       * fact; reading a value through and keeping no link does not.
       *
       * Its own request, allowed to fail, like the stamp above: it writes a
       * column PostgREST would fail the whole request over, and this one is
       * bookkeeping on top of an account that already exists.
       */
      const metro = await metroForInvite(betaCode);
      const seed = metro ? metroCentroid(metro) : null;
      if (seed) {
        const { error: seedError } = await serviceClient()
          .from("profiles")
          .update({ location: `POINT(${seed.lon} ${seed.lat})` })
          .eq("id", auth.user.id)
          .is("location", null);

        if (seedError) {
          console.error(JSON.stringify({ at: "phone.seedLocation", problem: seedError.message }));
        }
      }
    }
  }

  redirect(nextRoute("phone"));
}
