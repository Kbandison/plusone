"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, VERIFICATION, parseServerEnv } from "@plusone/config";
import { verification } from "@plusone/logic";

import { serviceClient } from "@/lib/cron";
import { createAwsLivenessProvider, vendBrowserCredentials } from "@/lib/liveness-aws";
import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import type { LivenessState } from "./state";

const E = DRAFT_COPY.liveness.errors;
const A = DRAFT_COPY.liveness.appealErrors;

/**
 * The liveness step (§7.2 step 2, Decision #21).
 *
 * TWO round trips, not one. The stub could decide in a single call because it
 * invented its own answer; a real provider cannot. AWS Face Liveness needs a
 * session opened server-side, a video streamed from the member's device to AWS,
 * and only then a result read back — so `begin` and `finish` are separate, and
 * the member's browser is in the middle of them.
 *
 * Which is exactly why nothing the browser says is trusted here. It does not
 * report whether it passed, it does not report its score, and it no longer
 * reports how many attempts it has left. It reports a session id, and the
 * verdict is fetched from AWS against that id.
 */

interface Attempted {
  readonly status: verification.VerificationStatus;
  readonly attempts: number;
  /** The session this member has open, if any. The only one they may finish. */
  readonly sessionId: string | null;
  readonly appealOpenedAt: string | null;
  readonly appealDecidedAt: string | null;
}

/** An appeal the member has asked for and nobody has ruled on yet. */
function appealIsOpen(current: Attempted): boolean {
  if (!current.appealOpenedAt) return false;
  if (!current.appealDecidedAt) return true;
  return current.appealDecidedAt < current.appealOpenedAt;
}

/** Reads the member's real verification state. Never from the client. */
async function readState(userId: string): Promise<Attempted> {
  const { data } = await serviceClient()
    .from("profiles")
    .select(
      "verification_status, liveness_attempts, liveness_session_id, appeal_opened_at, appeal_decided_at",
    )
    .eq("id", userId)
    .maybeSingle();

  return {
    status: (data?.verification_status ?? "phone_verified") as verification.VerificationStatus,
    attempts: (data?.liveness_attempts as number | null) ?? 0,
    sessionId: (data?.liveness_session_id as string | null) ?? null,
    appealOpenedAt: (data?.appeal_opened_at as string | null) ?? null,
    appealDecidedAt: (data?.appeal_decided_at as string | null) ?? null,
  };
}

/** What the member has left, from the row rather than from a phase-old label. */
function attemptsLeftFor(current: Attempted): number {
  return Math.max(0, VERIFICATION.livenessMaxRetries - current.attempts);
}

function stateFor({ status, attempts }: Attempted): verification.VerificationState {
  return {
    status,
    livenessAttempts: attempts,
    lastScore: null,
    decidedAt: null,
    appealOpenedAt: null,
    appealDecidedAt: null,
  };
}

/**
 * The configured provider, or null if there is not one we can use.
 *
 * Returns null rather than propagating, because the one case that throws is the
 * stub in production — deliberately, since a provider that always passes IS the
 * fake-profile problem this whole pipeline exists to prevent, and shipping one
 * by accident has to be loud. But it was loud in the WRONG PLACE: the call sat
 * outside the try, so a deployment with LIVENESS_PROVIDER=stub met a member at
 * step 2 of signing up with an unhandled 500 rather than a sentence. It is
 * logged here instead, which is where whoever misconfigured it will look, and
 * the member gets the same "unavailable" any other outage produces.
 */
function providerFor(env: ReturnType<typeof parseServerEnv>): verification.LivenessProvider | null {
  switch (env.LIVENESS_PROVIDER) {
    case "stub":
      try {
        return verification.createStubLivenessProvider();
      } catch (error) {
        console.error(JSON.stringify({ at: "liveness.provider", problem: String(error) }));
        return null;
      }
    case "aws_rekognition":
      // The schema guarantees all three are present for this provider, so the
      // assertions cannot fire — they are here so a future widening of the env
      // fails to compile rather than at a member's selfie step.
      return createAwsLivenessProvider({
        region: env.AWS_REGION!,
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      });
    default:
      return null;
  }
}

/**
 * Opens a check: a Rekognition session, plus credentials for the device to
 * stream to it.
 *
 * The attempt is NOT spent here — the reducer counts it when a result comes
 * back, and this docstring said the opposite of the code for half a day.
 *
 * Charging at the door looked right (an abandoned session is not free at AWS)
 * and was wrong twice over: the reducer counts too, so every check was charged
 * against a cap of three and members were flagged after two; and it charged
 * anybody whose camera never opened, which on a desktop without a webcam is
 * everybody. The billable event at AWS is a STREAMED analysis, and an abandoned
 * session is not one.
 */
export async function beginLiveness(
  previous: LivenessState,
  _formData: FormData,
): Promise<LivenessState> {
  const { userId } = await requireStep("liveness");

  const env = parseServerEnv(process.env);
  const provider = providerFor(env);
  // Before `current` is read there is no count to show, so the label stands.
  if (!provider) return { ...previous, error: E.unavailable, phase: "settled", session: null };

  const current = await readState(userId);

  // A status of `liveness_pending` means a previous session was opened and never
  // finished — the member closed the tab, or the camera failed. The reducer
  // rightly refuses to start a second check while one is in progress, but from
  // here that is indistinguishable from "start over", and refusing leaves them
  // stuck on a step they cannot leave. Nothing was counted, because only a
  // completed analysis is, so restarting costs them nothing.
  const resumable: Attempted =
    current.status === "liveness_pending" ? { ...current, status: "phone_verified" } : current;

  const started = verification.transition(stateFor(resumable), {
    type: "start_liveness",
    at: Date.now(),
  });
  if (!started.ok) {
    // The reducer knows why, and each reason is a different screen.
    //
    // `under_review` used to fall into the generic "unavailable, try again in a
    // moment" — told to a member the machine had just handed to a human, on a
    // step they can no longer pass, with a button that would say it again
    // forever. That is the hostile verification Decision #21 exists to be the
    // opposite of, and this file already carried a comment about the same
    // mistake made one layer down.
    if (started.code === "under_review") {
      // Which KIND of review matters. "Somebody will look" is true of a flagged
      // member and false of one an administrator has already refused — they
      // need to be told the review finished, and offered the appeal Decision #21
      // promises.
      return {
        error: null,
        attemptsLeft: 0,
        review: {
          status: current.status === "rejected" ? "rejected" : "flagged",
          appealOpen: appealIsOpen(current),
        },
        phase: "settled",
        session: null,
      };
    }

    // Already through. Nothing to do here, and `/onboarding` knows where they
    // belong next.
    if (started.code === "already_verified") redirect("/onboarding");

    return {
      ...previous,
      error: started.code === "phone_not_verified" ? E.phoneFirst : E.unavailable,
      // Not `previous`'s count: that is a phase behind and would show a member
      // attempts they do not have.
      attemptsLeft: attemptsLeftFor(current),
      phase: "settled",
      session: null,
    };
  }

  // Out of attempts already: no session, no AWS call, no spend.
  if (current.attempts >= VERIFICATION.livenessMaxRetries) {
    return {
      error: null,
      attemptsLeft: 0,
      review: { status: "flagged", appealOpen: appealIsOpen(current) },
      phase: "settled",
      session: null,
    };
  }

  let sessionId: string;
  let credentials;
  try {
    const session = await provider.createSession();
    sessionId = session.sessionId;
    credentials = await vendBrowserCredentials({
      region: env.AWS_REGION!,
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    });
  } catch {
    return {
      ...previous,
      error: E.unavailable,
      attemptsLeft: attemptsLeftFor(current),
      phase: "settled",
      session: null,
    };
  }

  // Status AND the session id. The attempt is NOT counted here.
  //
  // It was, and the reducer counts too — `state.livenessAttempts + 1` — so
  // every check was charged twice and members were flagged after two attempts
  // rather than three. One counter, and it is the tested one.
  //
  // Counting here would also charge a member whose camera never opened, which
  // on a desktop without a webcam is everyone. The billable thing at AWS is a
  // streamed analysis, and an unstreamed session is not one.
  //
  // The session id is stored because it is a capability. It used to be handed
  // to the browser and read back off the submitted form, so one member could
  // paste another's session id in and claim their verdict — AWS answers
  // GetFaceLivenessSessionResults for whoever asks. Now the row owns it and the
  // form is not consulted.
  await serviceClient()
    .from("profiles")
    .update({ verification_status: "liveness_pending", liveness_session_id: sessionId })
    .eq("id", userId);

  return {
    error: null,
    attemptsLeft: attemptsLeftFor(current),
    review: null,
    phase: "open",
    session: { sessionId, region: env.AWS_REGION!, credentials },
  };
}

/**
 * Reads the verdict AWS recorded for this session and lets the reducer decide.
 *
 * The session id comes from the ROW, never from the request. The comment that
 * used to sit here argued the opposite — that the browser is the only party who
 * knows which session it streamed, and that borrowing another id "gains them
 * nothing they could not get by doing the check". True of one honest person,
 * false of the attack this check exists to stop: one operator passes a single
 * genuine check, reads the id out of their own page, and submits it from every
 * other account they hold. AWS answers GetFaceLivenessSessionResults for
 * whoever asks, so each of those accounts is handed a real SUCCEEDED verdict
 * with no camera ever opening.
 *
 * So the form is not consulted, and the id is consumed on use — a verdict is
 * good for exactly one decision, even for the member who earned it.
 */
export async function finishLiveness(
  previous: LivenessState,
  _formData: FormData,
): Promise<LivenessState> {
  const { userId } = await requireStep("liveness");

  const env = parseServerEnv(process.env);
  const provider = providerFor(env);
  // Before `current` is read there is no count to show, so the label stands.
  if (!provider) return { ...previous, error: E.unavailable, phase: "settled", session: null };

  const current = await readState(userId);

  // No open session of their own means no verdict of theirs to read.
  const sessionId = current.sessionId;
  if (!sessionId)
    return {
      ...previous,
      error: E.unavailable,
      attemptsLeft: attemptsLeftFor(current),
      phase: "settled",
      session: null,
    };

  let outcome: verification.LivenessOutcome;
  try {
    outcome = await provider.fetchOutcome(sessionId);
  } catch {
    return {
      ...previous,
      error: E.unavailable,
      attemptsLeft: attemptsLeftFor(current),
      phase: "settled",
      session: null,
    };
  }

  // The member's REAL status, not an asserted one.
  //
  // This used to force `status: "liveness_pending"`, discarding whatever the row
  // said and defeating the only two guards the reducer has on this event:
  // `no_liveness_in_progress`, and the refusal whose comment reads "Under
  // review, only an administrator moves a member". A member already flagged
  // after three failures could submit a passing verdict and be written straight
  // to 'verified', around admin_decide_verification — the RPC that makes that
  // rule a wall rather than a convention.
  const decided = verification.transition(stateFor(current), {
    type: "liveness_result",
    at: Date.now(),
    outcome,
  });
  if (!decided.ok)
    return {
      ...previous,
      error: E.unavailable,
      attemptsLeft: attemptsLeftFor(current),
      phase: "settled",
      session: null,
    };

  const next = decided.state;

  // Written with the service client, not the member's session client.
  //
  // verification_status is no longer in the members' update grant
  // (20260815000800) — it was, and that meant one PATCH to /rest/v1/profiles
  // made anyone verified without ever running a liveness check. Verification is
  // the wall the whole product rests on, so the member who is being verified
  // must not be the one writing down the verdict.
  //
  // Safe here precisely because the value does not come from the member. It
  // comes from the reducer above, which read it off the provider. A member can
  // trigger this action; they cannot tell it what happened.
  await serviceClient()
    .from("profiles")
    .update({
      verification_status: next.status,
      // The reducer's count, written once. Nothing else increments it.
      liveness_attempts: next.livenessAttempts,
      // Consumed. A verdict is good for exactly one decision.
      liveness_session_id: null,
      ...(next.status === "verified"
        ? {
            liveness_passed_at: new Date().toISOString(),
            verified_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq("id", userId);

  if (next.status === "verified") redirect("/onboarding");

  return {
    error: next.status === "flagged" ? null : E.failed,
    attemptsLeft: Math.max(0, VERIFICATION.livenessMaxRetries - next.livenessAttempts),
    // The reducer's word, not a count we re-derive.
    review: verification.REVIEW_STATUSES.includes(
      next.status as (typeof verification.REVIEW_STATUSES)[number],
    )
      ? { status: next.status === "rejected" ? "rejected" : "flagged", appealOpen: false }
      : null,
    phase: "settled",
    session: null,
  };
}

/**
 * The member asking a human to look again (Decision #21).
 *
 * The rule lives in `open_verification_appeal`, not here: only a member under
 * review may appeal, an open appeal cannot be opened twice, and a DECIDED
 * appeal does not block a new one — because the rejection that followed the
 * first appeal has to be appealable too, or the path is locked behind its own
 * outcome, which is the trap #21 names by name.
 *
 * Deliberately not gated on liveness. A member who never passed a check can
 * still ask, which is the whole point.
 */
export async function openAppeal(
  previous: LivenessState,
  _formData: FormData,
): Promise<LivenessState> {
  const { userId } = await requireStep("liveness");

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("open_verification_appeal");

  if (error) {
    const message = /already open/i.test(error.message)
      ? A.alreadyOpen
      : /no review to appeal/i.test(error.message)
        ? A.notUnderReview
        : A.failed;
    return { ...previous, error: message, phase: "settled", session: null };
  }

  const current = await readState(userId);
  return {
    error: null,
    attemptsLeft: 0,
    review: {
      status: current.status === "rejected" ? "rejected" : "flagged",
      appealOpen: appealIsOpen(current),
    },
    phase: "settled",
    session: null,
  };
}
