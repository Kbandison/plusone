import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { CommunityForm } from "./community-form";

export const metadata: Metadata = { title: "Your community" };

export default async function CommunityPage() {
  await requireStep("community_condition");

  return (
    <StepShell
      step="community_condition"
      heading={DRAFT_COPY.community.heading}
      intro={DRAFT_COPY.community.intro}
    >
      <CommunityForm />
    </StepShell>
  );
}
