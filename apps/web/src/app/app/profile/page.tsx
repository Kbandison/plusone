import type { Metadata } from "next";

import {
  COPY,
  DRAFT_COPY,
  INTENTION_LABELS,
  RADIUS,
  promptQuestion,
  type Intention,
  type ProfilePromptAnswer,
} from "@plusone/config";

import { ownPhotoList, ownPhotos } from "@/lib/photo-urls";
import { approximateLocation } from "@/lib/dial-code";
import { MAX_PHOTOS } from "@/lib/photo-limits";
import { PhotoGallery, PhotoUploader, PrivacyChoice } from "@/app/onboarding/photos/photos-form";
import { RadiusForm } from "@/app/onboarding/radius/radius-form";
import { NameEditor } from "./name-editor";
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
      "display_name, intention, mode, search_radius_mi, photo_privacy, bio, prompts, gender, seeking, age_min, age_max, smokes, drinks, kids, kids_plan",
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

  return (
    <main id="main">
      <div className="flex items-center gap-4">
        <MemberPhotoFrame photo={photos[0]} size={72} emptyLabel={DRAFT_COPY.app.photoNone} />
        <h1 className="text-h2">{profile?.display_name ?? C.profileHeading}</h1>
      </div>

      {/* The name, which was set once in onboarding and never again — and is
          the word every other member sees on every connect, every chat and
          every room post they did not write anonymously. */}
      <NameEditor name={(profile?.display_name as string | null) ?? ""} />

      {/* The gallery itself, not a link to it.
          It has existed since Milestone 2 and lived at /onboarding/photos,
          which a finished member can reach and would never look for. A link
          was better than nothing and still asked somebody to go somewhere to
          do the most ordinary thing on this page. */}
      <section className={SECTION}>
        <h2 className="text-[0.972rem]">{C.profilePhotosHeading}</h2>

        <PhotoGallery photos={photoList}>
          {photoList.length < MAX_PHOTOS ? <PhotoUploader count={photoList.length} /> : null}
        </PhotoGallery>

        <PrivacyChoice canContinue={photoList.length > 0} privacy={photoPrivacy} />
      </section>

      <dl className={`${SECTION} flex flex-col gap-5`}>
        <div>
          <dt className="text-[11px] tracking-[0.04em] text-ink-3 uppercase">
            {C.profileLookingFor}
          </dt>
          <dd className="mt-1.5 text-[13px]">
            {intention ? INTENTION_LABELS[intention] : C.profileNotSet}
          </dd>
          {/* §3.4, verbatim. The lock is what makes the answer mean something. */}
          <dd className="mt-1.5 text-[11.3px] text-ink-3">{COPY.intention.lockNotice}</dd>
        </div>
      </dl>

      {/* The slider, not a number and a link to a screen with the slider on it.
          This decides who is in tonight's Drop and who is in Browse, and it was
          shown here and changeable somewhere else. */}
      <section className={SECTION}>
        <h2 className="text-[0.972rem]">{C.profileRadius}</h2>
        <RadiusForm
          radiusMi={(profile?.search_radius_mi as number | null) ?? RADIUS.defaultMi}
          approximate={approximate}
        />
      </section>

      {prompts.length > 0 ? (
        <section className={SECTION}>
          <h2 className="text-[0.972rem]">{DRAFT_COPY.app.promptsHeading}</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {prompts.map((prompt) => (
              <li key={prompt.id} className="rounded-lg border border-line px-5 py-4">
                <p className="text-[11px] text-ink-3">{promptQuestion(prompt.id)}</p>
                <p className="mt-1.5 text-[12.6px] leading-[1.6]">{prompt.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
