import type { Metadata } from "next";

import {
  COOLDOWNS,
  DRAFT_COPY,
  PROFILE_PROMPTS,
  QUIZ_QUESTIONS,
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
import { QuizForm } from "@/app/onboarding/quiz/quiz-form";
import { saveQuizSetting } from "./quiz-actions";
import { CollapsibleSection } from "../collapsible-section";
import { ownQuizAnswers } from "@/lib/own-profile";
import { redirect } from "next/navigation";
import { savePhotoPrivacySetting } from "./photo-privacy-actions";

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

/**
 * The photos section, which is first and needs no rule above it.
 *
 * SECTION's border and padding separate one block of settings from the next.
 * The first block has the member's own name and face above it instead, which
 * already says where the page begins — so the rule was drawing a line under a
 * heading nobody needed and holding ~96px of empty screen above the thing the
 * page is mostly for.
 */
/**
 * The group label.
 *
 * Deliberately not styled as a section heading: it names a GROUP of them, and
 * at heading weight it would compete with the four collapsibles under it. Small,
 * spaced, uppercase — the same treatment the admin roster's column heads get,
 * which is the app's existing word for "this labels what follows".
 *
 * FIRST_SECTION is gone with it. It existed to give the photo block less room
 * above than a section gets, because it sat directly under the member's face;
 * the first group label now does that job and does it by saying something.
 */
const GROUP = "mt-12 text-[0.72rem] tracking-[0.13em] text-ink-3 uppercase";

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
      "display_name, intention, intention_changed_at, mode, mode_dating_reentry_at, search_radius_mi, photo_privacy, bio, prompts, gender, seeking, age_min, age_max, smokes, drinks, kids, kids_plan",
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  /**
   * The eight from 20260829000100, read SEPARATELY and allowed to fail.
   *
   * They were appended to the select above, and that is a production outage
   * rather than a missing feature: migrations in this repo are applied by hand
   * and Kevin's call, so code reaches production BEFORE the schema does.
   * PostgREST answers an unknown column by failing the whole request, supabase-js
   * hands back `data: null`, and every field on this page — name, bio, prompts,
   * intention, the lot — renders empty. One unshipped column blanks the profile
   * for every member.
   *
   * A second request costs a round trip and makes the deploy order stop
   * mattering in both directions: before the migration these eleven are simply
   * unstated, and after it they fill in with no redeploy. The alternative is a
   * coupling nothing in the build can check and only production reveals.
   */
  const { data: extras } = await supabase
    .from("profiles")
    .select(
      "height_cm, weight_kg, relationship_structure, exercise, diet, pets, education, work, languages, religion, politics",
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  const mode = profile?.mode === "support_only" ? "support_only" : "dating";
  const intention = profile?.intention as Intention | null;
  const prompts = (profile?.prompts ?? []) as ProfilePromptAnswer[];
  const [photos, photoList, approximate, quizAnswers, { data: isPremium }] = await Promise.all([
    ownPhotos(auth.user.id),
    // The manageable list, which carries the ids and positions the gallery
    // needs — ownPhotos returns rendered URLs and cannot be reordered.
    ownPhotoList(auth.user.id),
    approximateLocation(),
    ownQuizAnswers(auth.user.id),
    // Whether per-photo privacy can be SET (server 18b). Never whether an
    // existing override is kept — a lapse must not make anybody more visible.
    supabase.rpc("i_am_premium"),
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
    // eslint-disable-next-line react-hooks/purity -- Server Component: one render per request, on the server. The rule models a client re-render, which this has none of.
    unlocksAt && unlocksAt.getTime() > Date.now()
      ? unlocksAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;

  /**
   * When dating becomes available again, or null.
   *
   * The same shape as the intention cooldown above, and for the same reason:
   * `switch_mode` stamps `mode_dating_reentry_at` on the way into support-only
   * and refuses the way out until it passes, so the screen needs the date to
   * agree with the RPC rather than offering a button that raises.
   *
   * Null once it has passed, so ModeToggle never has to know whether a
   * non-null column is still in the future.
   */
  const reentryAt = profile?.mode_dating_reentry_at as string | null | undefined;
  const datingAgainOn =
    // eslint-disable-next-line react-hooks/purity -- Server Component: one render per request, on the server. The rule models a client re-render, which this has none of.
    reentryAt && new Date(reentryAt).getTime() > Date.now()
      ? new Date(reentryAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null;

  /**
   * How many of the nineteen details are answered.
   *
   * On the closed row, so the section says whether it wants you before you open
   * it — which is the whole reason a fold is tolerable here rather than just a
   * thing to tap through.
   */
  const detailValues = [
    profile?.gender,
    (profile?.seeking as string[] | null)?.length ? profile?.seeking : null,
    profile?.age_min,
    profile?.age_max,
    profile?.smokes,
    profile?.drinks,
    profile?.kids,
    profile?.kids_plan,
    extras?.height_cm,
    extras?.relationship_structure,
    extras?.exercise,
    extras?.diet,
    extras?.pets,
    extras?.education,
    extras?.work,
    (extras?.languages as string[] | null)?.length ? extras?.languages : null,
    extras?.weight_kg,
    extras?.religion,
    extras?.politics,
  ];
  const detailsSet = detailValues.filter((v) => v !== null && v !== undefined).length;

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

      {/* TWO GROUPS, and the labels are the point.
          Nine blocks sat in one column with nothing saying what any of them was
          for, so the page read as a list of controls. Everything under the first
          label is what another member sees; everything under the second decides
          who is shown to you. A member coming here to change a photo passes
          nothing about matching on the way.

          The tall ones fold and the short ones do not. Photos, the details form
          and the quiz are the only blocks with real height; a fold over a single
          dropdown is a tap standing in for the control it hides. */}
      <h2 className={GROUP}>{C.profileGroupSeen}</h2>

      <CollapsibleSection
        heading={C.profilePhotosHeading}
        count={C.profileCountOf(photoList.length, MAX_PHOTOS)}
      >
        <PhotoGallery
          photos={photoList}
          settings
          premium={Boolean(isPremium)}
          // So each tile can show what actually happens to that photo, rather
          // than only whether it carries an override.
          profilePrivacy={photoPrivacy}
        >
          {photoList.length < MAX_PHOTOS ? <PhotoUploader count={photoList.length} /> : null}
        </PhotoGallery>

        <PrivacyChoice
          canContinue={photoList.length > 0}
          privacy={photoPrivacy}
          // The PROFILE's action. Passing the onboarding one — which is what a
          // `settings` boolean silently did — saves the choice and then
          // redirects the member into the radius step.
          save={savePhotoPrivacySetting}
        />
      </CollapsibleSection>

      <CollapsibleSection
        heading={DRAFT_COPY.app.bioHeading}
        count={profile?.bio ? C.profileBioWritten : C.profileBioEmpty}
      >
        <BioEditor bio={(profile?.bio as string | null) ?? null} bare />
      </CollapsibleSection>

      <CollapsibleSection
        heading={DRAFT_COPY.app.promptsHeading}
        count={C.profileCountOf(prompts.length, PROFILE_PROMPTS.length)}
      >
        <PromptEditor answers={prompts} bare />
      </CollapsibleSection>

      {/* The answers that decide the Drop, changeable. Asking them once in
          onboarding would have made them write-once, and they are the only
          settings in the product that determine everything a member ever sees. */}
      <CollapsibleSection
        heading={DRAFT_COPY.preferences.editHeading}
        count={C.profileCountOf(detailsSet, detailValues.length)}
      >
        {/* "full", so the eight from 20260829000100 render HERE and not in
            onboarding — which is nine steps already. The prop also decides
            whether those columns are written at all: parsePreferences reads it
            off a hidden field, because a core post that parsed eight absent
            controls would clear all eight. */}
        <PreferencesForm
          action={updatePreferences}
          scope="full"
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
            heightCm: (extras?.height_cm as number | null) ?? null,
            relationshipStructure: (extras?.relationship_structure as string | null) ?? null,
            exercise: (extras?.exercise as string | null) ?? null,
            diet: (extras?.diet as string | null) ?? null,
            pets: (extras?.pets as string | null) ?? null,
            education: (extras?.education as string | null) ?? null,
            work: (extras?.work as string | null) ?? null,
            languages: (extras?.languages as string[] | null) ?? [],
            weightKg: (extras?.weight_kg as number | null) ?? null,
            religion: (extras?.religion as string | null) ?? null,
            politics: (extras?.politics as string | null) ?? null,
          }}
        />
      </CollapsibleSection>

      <h2 className={GROUP}>{C.profileGroupMeet}</h2>

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

      {/* The way back to "Skip for now".
          A skip writes an empty row and resolveStep reads presence, so the step
          settles and never returns — and nothing in /app linked to it. A member
          who took the app at its word on step 8 had no way back to the twelve
          questions that shape every Drop they will ever see. */}
      <CollapsibleSection
        heading={DRAFT_COPY.quiz.heading}
        count={DRAFT_COPY.quiz.progress(Object.keys(quizAnswers).length, QUIZ_QUESTIONS.length)}
      >
        <QuizForm answered={quizAnswers} save={saveQuizSetting} />
      </CollapsibleSection>

      <section className={SECTION}>
        <h2 className="text-[0.972rem]">{C.profileModeHeading}</h2>
        <ModeToggle mode={mode} datingAgainOn={datingAgainOn} />
      </section>
    </main>
  );
}
