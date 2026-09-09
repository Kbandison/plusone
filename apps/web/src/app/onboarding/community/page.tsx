import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { ownProfile } from "@/lib/own-profile";
import { CommunityForm } from "./community-form";

export const metadata: Metadata = { title: "Your community" };

export default async function CommunityPage() {
  await requireStep("community_condition");
  const profile = await ownProfile();

  return (
    <StepShell
      step="community_condition"
      heading={DRAFT_COPY.community.heading}
      intro={DRAFT_COPY.community.intro}
    >
      <CommunityForm
        community={(profile?.community as "hsv" | "hiv" | null) ?? null}
        condition={profile?.condition ?? null}
        uEqualsU={profile?.u_equals_u ?? false}
      />
    </StepShell>
  );
}
