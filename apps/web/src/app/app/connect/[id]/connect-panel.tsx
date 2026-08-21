import { notFound } from "next/navigation";

import { DRAFT_COPY, type ProfilePromptAnswer } from "@plusone/config";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../../member-photo";
import { ConnectForm } from "./connect-form";

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
  const { data: target } = await supabase
    .from("visible_profiles")
    .select("id, display_name, prompts")
    .eq("id", id)
    .maybeSingle();

  if (!target) notFound();

  const photos = await photosFor([target.id as string]);

  return (
    <>
      <div className="flex items-center gap-4">
        <MemberPhotoFrame photo={photos.get(target.id as string)} size={56} />
        <h1 className="text-h2">{target.display_name as string}</h1>
      </div>

      <h2 className="mt-8 text-[0.931rem]">{DRAFT_COPY.app.connectHeading}</h2>
      <p className="mt-4 text-[13px] leading-[1.7] text-ink-2">{DRAFT_COPY.app.connectIntro}</p>

      <ConnectForm
        targetId={target.id as string}
        prompts={(target.prompts ?? []) as ProfilePromptAnswer[]}
        source={source === "drop" || source === "room" ? source : "browse"}
        roomId={room ?? null}
      />
    </>
  );
}
