import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { ownProfile } from "@/lib/own-profile";
import { IntentionForm } from "./intention-form";

export const metadata: Metadata = { title: "What you are here for" };

export default async function IntentionPage() {
  await requireStep("intention");
  const profile = await ownProfile();

  return (
    <StepShell
      step="intention"
      heading={DRAFT_COPY.intention.heading}
      intro={DRAFT_COPY.intention.intro}
    >
      <IntentionForm intention={profile?.intention ?? null} />
    </StepShell>
  );
}
