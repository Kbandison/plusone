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

import { ownPhotos } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../member-photo";
import { ModeToggle } from "./mode-toggle";
import { BioEditor } from "./bio-editor";
import { PreferencesForm } from "@/app/onboarding/preferences/preferences-form";
import { updatePreferences } from "./preferences-actions";
import { PromptEditor } from "./prompt-editor";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: DRAFT_COPY.app.profileHeading };

const C = DRAFT_COPY.app;

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
      "display_name, intention, mode, search_radius_mi, bio, prompts, gender, seeking, age_min, age_max, smokes, drinks, kids, kids_plan",
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  const mode = profile?.mode === "support_only" ? "support_only" : "dating";
  const intention = profile?.intention as Intention | null;
  const prompts = (profile?.prompts ?? []) as ProfilePromptAnswer[];
  const photos = await ownPhotos(auth.user.id);

  return (
    <main id="main">
      <div className="flex items-center gap-4">
        <MemberPhotoFrame photo={photos[0]} size={72} emptyLabel={DRAFT_COPY.app.photoNone} />
        <h1 className="text-h2">{profile?.display_name ?? C.profileHeading}</h1>
      </div>

      {/* The photos, and a way to change them.
          The gallery has existed since Milestone 2 and lived only at
          /onboarding/photos — reachable, and somewhere nobody would look. So
          the picture other people judge you by was in practice unchangeable
          after the day you signed up. */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[0.972rem]">{C.profilePhotosHeading}</h2>
          <Link
            href="/app/profile/photos"
            className="ease-brand min-h-tap text-[11.7px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
          >
            {C.profilePhotosManage}
          </Link>
        </div>

        {photos.length > 1 ? (
          <ul className="mt-4 flex flex-wrap gap-3">
            {photos.slice(1).map((photo) => (
              <li key={photo.url}>
                <MemberPhotoFrame photo={photo} size={72} rounded="rounded-lg" />
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-3 text-[11px] text-ink-3">{C.profilePhotosCount(photos.length)}</p>
      </section>

      <dl className="mt-10 flex flex-col gap-5">
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

        <div>
          <dt className="text-[11px] tracking-[0.04em] text-ink-3 uppercase">{C.profileRadius}</dt>
          <dd className="mt-1.5 flex items-baseline justify-between gap-4 text-[13px]">
            {C.profileRadiusMiles(profile?.search_radius_mi ?? RADIUS.defaultMi)}
            {/* Shown and not changeable was the whole of it: this decides who
                is in tonight's Drop and who is in Browse, and it was set once
                on the way in and then frozen. */}
            <Link
              href="/app/profile/distance"
              className="ease-brand min-h-tap text-[11.7px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              {C.profileRadiusManage}
            </Link>
          </dd>
        </div>
      </dl>

      {prompts.length > 0 ? (
        <section className="mt-10">
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
      <section className="mt-16 border-t border-line pt-10">
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
      <section className="mt-16 border-t border-line pt-10">
        <h2 className="text-[0.972rem]">{C.profileModeHeading}</h2>
        <ModeToggle mode={mode} />
      </section>
    </main>
  );
}
