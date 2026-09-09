import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { MAX_PHOTOS } from "@/lib/photo-limits";
import { ownPhotoList } from "@/lib/photo-urls";
import { ownProfile } from "@/lib/own-profile";
import { getServerSupabase } from "@/lib/supabase";
import { PhotoGallery, PhotoUploader, PrivacyChoice } from "./photos-form";

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

export const metadata: Metadata = { title: "Your photos" };

export default async function PhotosPage() {
  const { userId } = await requireStep("photos");

  // The photos, not a count of them: the step has to show what it is counting
  // so a member can replace one or make room at the ceiling.
  const supabase = await getServerSupabase();
  // Per-photo privacy is premium to SET (server 18b). Asked here rather than in
  // the client component so a free member is shown the control and told what it
  // costs, instead of finding a disabled box with no explanation.
  const [photos, profile, { data: isPremium }] = await Promise.all([
    ownPhotoList(userId),
    ownProfile(),
    supabase.rpc("i_am_premium"),
  ]);
  const uploaded = photos.length;

  return (
    <StepShell step="photos" heading={DRAFT_COPY.photos.heading} intro={DRAFT_COPY.photos.intro}>
      {/* The add tile lives inside the grid, next to the last photo, rather
          than as a panel above it. */}
      <PhotoGallery photos={photos} premium={Boolean(isPremium)}>
        {uploaded < MAX_PHOTOS ? <PhotoUploader count={uploaded} /> : null}
      </PhotoGallery>
      <PrivacyChoice canContinue={uploaded > 0} privacy={profile?.photo_privacy ?? null} />
    </StepShell>
  );
}
