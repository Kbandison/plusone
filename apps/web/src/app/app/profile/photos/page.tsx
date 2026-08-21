import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { MAX_PHOTOS } from "@/lib/photo-limits";
import { ownPhotoList } from "@/lib/photo-urls";
import { ownProfile } from "@/lib/own-profile";
import { getServerSupabase } from "@/lib/supabase";
import { PhotoGallery, PhotoUploader, PrivacyChoice } from "@/app/onboarding/photos/photos-form";

export const metadata: Metadata = { title: DRAFT_COPY.app.profilePhotosHeading };

const C = DRAFT_COPY.app;

/**
 * Photos, after onboarding.
 *
 * The gallery — upload, delete, reorder, and the blurred-until-connected
 * choice — has existed since Milestone 2 and lived at /onboarding/photos, which
 * a finished member can still reach and would never think to look for. So the
 * one screen in the product for changing the picture other people judge you by
 * was, in practice, unreachable.
 *
 * The same components, rendered where somebody would look. Not copies: a second
 * gallery would be a second set of upload rules to keep in step with the first.
 */
export default async function ProfilePhotosPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const [photos, profile] = await Promise.all([ownPhotoList(auth.user.id), ownProfile()]);

  return (
    <main id="main">
      <Link
        href="/app/profile"
        className="ease-brand mb-2 inline-flex min-h-tap items-center text-[11.7px] text-ink-3 transition-colors duration-200 hover:text-ink"
      >
        ← {C.profileHeading}
      </Link>

      <h1 className="text-h2">{C.profilePhotosHeading}</h1>

      <PhotoGallery photos={photos}>
        {photos.length < MAX_PHOTOS ? <PhotoUploader count={photos.length} /> : null}
      </PhotoGallery>

      <PrivacyChoice canContinue={photos.length > 0} privacy={profile?.photo_privacy ?? null} />
    </main>
  );
}
