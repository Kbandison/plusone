import type { Metadata } from "next";

import {
  COOLDOWNS,
  DRAFT_COPY,
  RADIUS,
  type Intention,
  type ProfilePromptAnswer,
} from "@plusone/config";

import { ownPhotoList, ownPhotos } from "@/lib/photo-urls";
import { approximateLocation } from "@/lib/dial-code";
import { MAX_PHOTOS } from "@/lib/photo-limits";
import { PhotoGallery, PhotoUploader, PrivacyChoice } from "@/app/onboarding/photos/photos-form";
import { RadiusForm } from "@/app/onboarding/radius/radius-form";
import { NameEditor } from "./name-editor";
import { IntentionEditor } from "./intention-editor";
import { saveRadiusSetting } from "./radius-actions";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../member-photo";
import { ModeToggle } from "./mode-toggle";
import { BioEditor } from "./bio-editor";
import { PreferencesForm } from "@/app/onboarding/preferences/preferences-form";
import { updatePreferences } from "./preferences-actions";
import { PromptEditor } from "./prompt-editor";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: DRAFT_COPY.app.profileHeading };

const C = DRAFT_COPY.app;

/**
 * The break between two sections of the profile.
 *
 * One constant rather than four copies of a class string: they were a hairline
 * apiece and read as accidental gaps, and four literals would have drifted the
 * first time one of them was made heavier. border-line-2 is the darker of the
 * two rules the tokens define — a section boundary is a stronger statement than
 * the line between two rows in a list.
 */
const SECTION = "mt-14 border-t-2 border-line-2 pt-10";

export default async function ProfilePage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    // One literal, not a concatenation: supabase-js infers the row type FROM
    // this string, and a `+` between two halves makes it a plain string and
    // every field on the result an error type.
    .select(
      "display_name, intention, intention_changed_at, mode, search_radius_mi, photo_privacy, bio, prompts, gender, seeking, age_min, age_max, smokes, drinks, kids, kids_plan",
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  const mode = profile?.mode === "support_only" ? "support_only" : "dating";
  const intention = profile?.intention as Intention | null;
  const prompts = (profile?.prompts ?? []) as ProfilePromptAnswer[];
  const [photos, photoList, approximate] = await Promise.all([
    ownPhotos(auth.user.id),
    // The manageable list, which carries the ids and positions the gallery
    // needs — ownPhotos returns rendered URLs and cannot be reordered.
    ownPhotoList(auth.user.id),
    approximateLocation(),
  ]);
  const photoPrivacy = (profile?.photo_privacy as string | null) ?? null;

  /**
   * When the intention can change again, or null if it already can.
   *
   * intention_changed_at is `not null default now()`, so a profile that has
   * never chosen still carries a clock — the same reason change_intention
   * skips the check when `intention is null`. Read the two together or the
   * page locks a control nobody has used.
   */
  const changedAt = profile?.intention_changed_at as string | null | undefined;
  const unlocksAt =
    intention && changedAt
      ? new Date(new Date(changedAt).getTime() + COOLDOWNS.intentionChangeDays * 86_400_000)
      : null;
  const intentionChangeableOn =
    unlocksAt && unlocksAt.getTime() > Date.now()
      ? unlocksAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;

  return (
    <main id="main">
      {/* The name is the heading, and the heading is the field.
          It was set once in onboarding and never again — and it is the word
          every other member sees on every connect, every chat and every room
          post they did not write anonymously. */}
      <div className="flex items-center gap-4">
        <MemberPhotoFrame photo={photos[0]} size={72} emptyLabel={DRAFT_COPY.app.photoNone} />
        <NameEditor name={(profile?.display_name as string | null) ?? ""} />
      </div>

      {/* The gallery itself, not a link to it.
          It has existed since Milestone 2 and lived at /onboarding/photos,
          which a finished member can reach and would never look for. A link
          was better than nothing and still asked somebody to go somewhere to
          do the most ordinary thing on this page. */}
      <section className={SECTION}>
        <h2 className="text-[0.972rem]">{C.profilePhotosHeading}</h2>

        <PhotoGallery photos={photoList} settings>
          {photoList.length < MAX_PHOTOS ? <PhotoUploader count={photoList.length} /> : null}
        </PhotoGallery>

        <PrivacyChoice canContinue={photoList.length > 0} privacy={photoPrivacy} settings />
      </section>

      {/* Changeable, not just displayed. This is the answer that decides who is
          in the Drop; a member who picked wrong on their sixth screen could
          read the rule here and had nothing to do about it. */}
      <section className={SECTION}>
        <h2 className="text-[0.972rem]">{C.profileLookingFor}</h2>
        <IntentionEditor intention={intention} changeableOn={intentionChangeableOn} />
      </section>

      {/* The slider, not a number and a link to a screen with the slider on it.
          This decides who is in tonight's Drop and who is in Browse, and it was
          shown here and changeable somewhere else. */}
      <section className={SECTION}>
        <h2 className="text-[0.972rem]">{C.profileRadius}</h2>
        <RadiusForm
          radiusMi={(profile?.search_radius_mi as number | null) ?? RADIUS.defaultMi}
          approximate={approximate}
          save={saveRadiusSetting}
        />
      </section>

      <PromptEditor answers={prompts} />

      <BioEditor bio={(profile?.bio as string | null) ?? null} />

      {/* The answers that decide the Drop, changeable. Asking them once in
          onboarding would have made them write-once, and they are the only
          settings in the product that determine everything a member ever sees. */}
      <section className={SECTION}>
        <h2 className="text-[0.972rem]">{DRAFT_COPY.preferences.editHeading}</h2>
        <PreferencesForm
          action={updatePreferences}
          submitLabel={DRAFT_COPY.preferences.editSaveLabel}
          savedMessage={DRAFT_COPY.preferences.editSaved}
          defaults={{
            gender: (profile?.gender as string | null) ?? null,
            seeking: (profile?.seeking as string[] | null) ?? [],
            ageMin: (profile?.age_min as number | null) ?? null,
            ageMax: (profile?.age_max as number | null) ?? null,
            smokes: (profile?.smokes as string | null) ?? null,
            drinks: (profile?.drinks as string | null) ?? null,
            kids: (profile?.kids as string | null) ?? null,
            kidsPlan: (profile?.kids_plan as string | null) ?? null,
          }}
        />
      </section>
      <section className={SECTION}>
        <h2 className="text-[0.972rem]">{C.profileModeHeading}</h2>
        <ModeToggle mode={mode} />
      </section>
    </main>
  );
}
