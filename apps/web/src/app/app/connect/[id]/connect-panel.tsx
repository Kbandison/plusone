import { notFound } from "next/navigation";

import {
  DRAFT_COPY,
  INTENTION_LABELS,
  type Intention,
  type ProfilePromptAnswer,
} from "@plusone/config";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../../member-photo";
import { MemberTraitChips } from "../../member-traits";
import { ConnectForm } from "./connect-form";

const C = DRAFT_COPY.app;

/**
 * Replying to one of somebody's prompts (Decision #14).
 *
 * Its own component because it is rendered twice: as the page, and as the
 * intercepted route that opens over the Drop or Browse. Two copies of a screen
 * that decides who can reach whom is two places for that rule to drift.
 */
export async function ConnectPanel({
  id,
  source = "browse",
  room,
}: {
  id: string;
  source?: string | undefined;
  room?: string | undefined;
}) {
  const supabase = await getServerSupabase();

  // Read through visible_profiles, so a member who cannot see this person
  // cannot reach the compose screen either — a 404 rather than a form that
  // fails on submit.
  // It selected `id, display_name, prompts` and nothing else, so the screen
  // where somebody decides whether to reach out showed a name, a photograph and
  // one prompt. Age, distance, what they are looking for and everything they
  // wrote were all in this view already and none of it was asked for.
  const { data: target } = await supabase
    .from("visible_profiles")
    .select(
      "id, display_name, age, distance_mi, intention, bio, prompts, smokes, drinks, kids, kids_plan",
    )
    .eq("id", id)
    .maybeSingle();

  if (!target) notFound();

  const photos = await photosFor([target.id as string]);

  // The same line the Browse card carries, in the same order, so a member
  // arriving here from the grid reads the person rather than a second summary
  // of them.
  const meta = [
    target.age,
    target.distance_mi != null ? `${target.distance_mi} mi` : null,
    target.intention ? INTENTION_LABELS[target.intention as Intention] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="flex items-center gap-4">
        <MemberPhotoFrame photo={photos.get(target.id as string)} size={56} />
        <div className="min-w-0">
          <h1 className="text-h2">{target.display_name as string}</h1>
          {meta ? <p className="mt-1 text-[11.7px] text-ink-3">{meta}</p> : null}
        </div>
      </div>

      {/* Everything they said about themselves, on the screen where somebody
          decides whether to say something back. No max: this is a full screen,
          not a two-column card, and there are only ever four. */}
      {target.bio ? (
        <p className="mt-6 text-[13px] leading-[1.7] text-ink-2">{target.bio as string}</p>
      ) : null}
      <MemberTraitChips member={target} className="mt-4" />

      <h2 className="mt-8 text-[0.931rem]">{C.connectHeading}</h2>
      <p className="mt-4 text-[13px] leading-[1.7] text-ink-2">{C.connectIntro}</p>

      <ConnectForm
        targetId={target.id as string}
        prompts={(target.prompts ?? []) as ProfilePromptAnswer[]}
        source={source === "drop" || source === "room" ? source : "browse"}
        roomId={room ?? null}
      />
    </>
  );
}
