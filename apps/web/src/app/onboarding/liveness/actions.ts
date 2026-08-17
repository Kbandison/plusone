"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, VERIFICATION, parseServerEnv } from "@plusone/config";
import { verification } from "@plusone/logic";

import { serviceClient } from "@/lib/cron";
import { createAwsLivenessProvider, vendBrowserCredentials } from "@/lib/liveness-aws";
import { requireStep } from "@/lib/onboarding";
import type { LivenessState } from "./state";

const E = DRAFT_COPY.liveness.errors;

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
}

/** Reads the member's real verification state. Never from the client. */
async function readState(userId: string): Promise<Attempted> {
  const { data } = await serviceClient()
    .from("profiles")
    .select("verification_status, liveness_attempts")
    .eq("id", userId)
    .maybeSingle();

  return {
    status: (data?.verification_status ?? "phone_verified") as verification.VerificationStatus,
    attempts: (data?.liveness_attempts as number | null) ?? 0,
  };
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

function providerFor(env: ReturnType<typeof parseServerEnv>): verification.LivenessProvider | null {
  switch (env.LIVENESS_PROVIDER) {
    case "stub":
      return verification.createStubLivenessProvider();
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
 * The attempt is spent HERE, before the camera opens, rather than when a result
 * comes back. A member who opens a session and closes the tab has still cost a
 * Face Liveness call, and charging only for completed checks is what makes
 * "abandon and retry" an unlimited loop.
 */
export async function beginLiveness(
  previous: LivenessState,
  _formData: FormData,
): Promise<LivenessState> {
  const { userId } = await requireStep("liveness");

  const env = parseServerEnv(process.env);
  const provider = providerFor(env);
  if (!provider) return { ...previous, error: E.unavailable, session: null };

  const current = await readState(userId);

  const started = verification.transition(stateFor(current), {
    type: "start_liveness",
    at: Date.now(),
  });
  if (!started.ok) {
    // The reducer knows why. Reporting all of it as "unavailable" is what hid a
    // missing phone_verified transition behind what looked like a provider
    // outage — the same failure as telling a flagged member "not_under_review".
    return {
      ...previous,
      error: started.code === "phone_not_verified" ? E.phoneFirst : E.unavailable,
      session: null,
    };
  }

  // Out of attempts already: no session, no AWS call, no spend.
  if (current.attempts >= VERIFICATION.livenessMaxRetries) {
    return { error: null, attemptsLeft: 0, session: null };
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
    return { ...previous, error: E.unavailable, session: null };
  }

  const attempts = current.attempts + 1;
  await serviceClient()
    .from("profiles")
    .update({ liveness_attempts: attempts, verification_status: "liveness_pending" })
    .eq("id", userId);

  return {
    error: null,
    attemptsLeft: Math.max(0, VERIFICATION.livenessMaxRetries - attempts),
    session: { sessionId, region: env.AWS_REGION!, credentials },
  };
}

/**
 * Reads the verdict AWS recorded for this session and lets the reducer decide.
 *
 * The session id comes from the client, which is fine and is the only thing
 * that could: the browser is the only party that knows which session it just
 * streamed. It is not a capability — the verdict is fetched from AWS, so a
 * member substituting somebody else's session id gets somebody else's result
 * written to their own row, which gains them nothing they could not get by
 * doing the check.
 */
export async function finishLiveness(
  previous: LivenessState,
  formData: FormData,
): Promise<LivenessState> {
  const { userId } = await requireStep("liveness");

  const sessionId = String(formData.get("session_id") ?? "").trim();
  if (!sessionId) return { ...previous, error: E.unavailable, session: null };

  const env = parseServerEnv(process.env);
  const provider = providerFor(env);
  if (!provider) return { ...previous, error: E.unavailable, session: null };

  const current = await readState(userId);

  let outcome: verification.LivenessOutcome;
  try {
    outcome = await provider.fetchOutcome(sessionId);
  } catch {
    return { ...previous, error: E.unavailable, session: null };
  }

  // The state machine already counted this attempt in beginLiveness, so the
  // reducer is handed the state as it stands rather than one step behind.
  const decided = verification.transition(
    { ...stateFor(current), status: "liveness_pending" },
    { type: "liveness_result", at: Date.now(), outcome },
  );
  if (!decided.ok) return { ...previous, error: E.unavailable, session: null };

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
    attemptsLeft: Math.max(0, VERIFICATION.livenessMaxRetries - current.attempts),
    session: null,
  };
}
