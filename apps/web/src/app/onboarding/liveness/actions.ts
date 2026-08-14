"use server";

import { redirect } from "next/navigation";

import { DRAFT_COPY, VERIFICATION, parseServerEnv } from "@plusone/config";
import { verification } from "@plusone/logic";

import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";

const E = DRAFT_COPY.liveness.errors;

export type LivenessState = {
  readonly error: string | null;
  readonly attemptsLeft: number;
};

export const LIVENESS_INITIAL: LivenessState = {
  error: null,
  attemptsLeft: VERIFICATION.livenessMaxRetries,
};

/**
 * Runs one liveness attempt.
 *
 * The decision is `packages/logic/verification`'s, not this function's — the
 * reducer decides verified vs another attempt vs flagged, and this only carries
 * the result to the database. That is what keeps the rule in one tested place
 * rather than in a route handler.
 *
 * The raw selfie never reaches this process. §4.2 purges it at decision time and
 * keeps a boolean and a score; the provider seam has nowhere to return an image,
 * so there is nothing here to forget to delete.
 */
export async function runLivenessCheck(
  previous: LivenessState,
  _formData: FormData,
): Promise<LivenessState> {
  const { userId } = await requireStep("liveness");

  const env = parseServerEnv(process.env);

  // Only the stub exists so far; the real adapter slots in behind the same
  // interface when a provider is chosen (see PROJECT_UPDATES.md).
  const provider =
    env.LIVENESS_PROVIDER === "stub"
      ? verification.createStubLivenessProvider()
      : null;

  if (!provider) return { ...previous, error: E.unavailable };

  const supabase = await getServerSupabase();
  const { data: row } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", userId)
    .maybeSingle();

  const state: verification.VerificationState = {
    status: (row?.verification_status ?? "phone_verified") as verification.VerificationStatus,
    livenessAttempts: VERIFICATION.livenessMaxRetries - previous.attemptsLeft,
    lastScore: null,
    decidedAt: null,
    appealOpenedAt: null,
  };

  const started = verification.transition(state, { type: "start_liveness", at: Date.now() });
  if (!started.ok) return { ...previous, error: E.unavailable };

  let outcome: verification.LivenessOutcome;
  try {
    const session = await provider.createSession();
    outcome = await provider.fetchOutcome(session.sessionId);
  } catch {
    return { ...previous, error: E.unavailable };
  }

  const decided = verification.transition(started.state, {
    type: "liveness_result",
    at: Date.now(),
    outcome,
  });
  if (!decided.ok) return { ...previous, error: E.unavailable };

  const next = decided.state;
  await supabase
    .from("profiles")
    .update({
      verification_status: next.status,
      ...(next.status === "verified" ? { verified_at: new Date().toISOString() } : {}),
    })
    .eq("id", userId);

  if (next.status === "verified") redirect("/onboarding");

  return {
    error: next.status === "flagged" ? null : E.failed,
    attemptsLeft: verification.attemptsRemaining(next),
  };
}
