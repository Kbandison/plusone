import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { ownProfile } from "@/lib/own-profile";
import { BasicsForm } from "./basics-form";

export const metadata: Metadata = { title: "The basics" };

export default async function BasicsPage() {
  // Also the guard: typing this URL out of order sends the member to the step
  // they actually belong on.
  await requireStep("profile_basics");
  const profile = await ownProfile();

  return (
    <StepShell
      step="profile_basics"
      heading={DRAFT_COPY.basics.heading}
      intro={DRAFT_COPY.basics.intro}
    >
      <BasicsForm displayName={profile?.display_name ?? ""} birthdate={profile?.birthdate ?? ""} />
    </StepShell>
  );
}
