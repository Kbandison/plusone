import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { ownProfile } from "@/lib/own-profile";
import { RadiusForm } from "./radius-form";

export const metadata: Metadata = { title: "Distance" };

export default async function RadiusPage() {
  await requireStep("radius");
  const profile = await ownProfile();

  return (
    <StepShell step="radius" heading={DRAFT_COPY.radius.heading} intro={DRAFT_COPY.radius.intro}>
      <RadiusForm radiusMi={profile?.search_radius_mi ?? null} />
    </StepShell>
  );
}
