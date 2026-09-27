import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { STEP_ROUTES, loadFacts } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import { StepShell } from "../step-shell";
import { BackupEmailForm } from "./email-form";

export const metadata: Metadata = { title: "Backup email" };

/**
 * The backup email, between the phone code and the face check.
 *
 * NOT an onboarding step, deliberately. A step is settled by a fact, and an
 * optional screen has nothing to settle it — as a step, "Skip for now" would
 * have to be recorded somewhere or the resolver would send the member back
 * here for ever. So it is a screen the phone step hands on to, once, and the
 * resolver never mentions it. A member who returns mid-onboarding goes to
 * their real step and is not asked again; they can add one in Settings once
 * they are in.
 *
 * Shown only straight after the phone, to somebody with no confirmed address.
 * Anybody else — further along, finished, or already holding an email — goes
 * where they belong.
 */
export default async function BackupEmailPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(STEP_ROUTES.phone);

  const step = onboarding.resolveStep(await loadFacts(data.user.id));
  if (step !== "liveness" || data.user.email_confirmed_at) redirect(STEP_ROUTES[step]);

  const C = DRAFT_COPY.backupEmail;
  return (
    // Counted as part of the phone step: it is still "how we reach you", and a
    // progress bar that moved for an optional screen would mislead.
    <StepShell step="phone" heading={C.heading} intro={C.intro}>
      <BackupEmailForm skipTo={STEP_ROUTES.liveness} />
    </StepShell>
  );
}
