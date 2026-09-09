import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { ownProfile } from "@/lib/own-profile";
import { CommunityForm } from "./community-form";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

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
