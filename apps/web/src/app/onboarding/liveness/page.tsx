import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { LivenessForm } from "./liveness-form";

export const metadata: Metadata = { title: "Verification" };

export default async function LivenessPage() {
  await requireStep("liveness");

  return (
    <StepShell
      step="liveness"
      heading={DRAFT_COPY.liveness.heading}
      intro={DRAFT_COPY.liveness.intro}
    >
      <LivenessForm />
    </StepShell>
  );
}
