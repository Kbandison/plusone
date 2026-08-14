import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import { PhotoUploader, PrivacyChoice } from "./photos-form";

export const metadata: Metadata = { title: "Your photos" };

export default async function PhotosPage() {
  const { userId } = await requireStep("photos");

  const supabase = await getServerSupabase();
  const { count } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const uploaded = count ?? 0;

  return (
    <StepShell step="photos" heading={DRAFT_COPY.photos.heading} intro={DRAFT_COPY.photos.intro}>
      <PhotoUploader count={uploaded} />
      <PrivacyChoice canContinue={uploaded > 0} />
    </StepShell>
  );
}
