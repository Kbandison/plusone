import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { approximateLocation } from "@/lib/dial-code";
import { requireStep } from "@/lib/onboarding";
import { ownProfile } from "@/lib/own-profile";
import { RadiusForm } from "./radius-form";

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

export const metadata: Metadata = { title: "Distance" };

export default async function RadiusPage() {
  await requireStep("radius");
  const [profile, approximate] = await Promise.all([ownProfile(), approximateLocation()]);

  return (
    <StepShell step="radius" heading={DRAFT_COPY.radius.heading} intro={DRAFT_COPY.radius.intro}>
      <RadiusForm radiusMi={profile?.search_radius_mi ?? null} approximate={approximate} />
    </StepShell>
  );
}
