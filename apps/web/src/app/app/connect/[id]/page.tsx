import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DRAFT_COPY, type ProfilePromptAnswer } from "@plusone/config";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../../member-photo";
import { ConnectForm } from "./connect-form";

export const metadata: Metadata = { title: DRAFT_COPY.app.connectHeading };

export default async function ConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string; room?: string }>;
}) {
  const { id } = await params;
  const { source = "browse", room } = await searchParams;

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
    <main id="main">
      <div className="flex items-center gap-4">
        <MemberPhotoFrame photo={photos.get(target.id as string)} size={56} />
        <h1 className="text-h2">{target.display_name as string}</h1>
      </div>

      <h2 className="mt-8 text-[1.103rem]">{DRAFT_COPY.app.connectHeading}</h2>
      <p className="mt-4 text-[15.4px] leading-[1.7] text-ink-2">{DRAFT_COPY.app.connectIntro}</p>

      <ConnectForm
        targetId={target.id as string}
        prompts={(target.prompts ?? []) as ProfilePromptAnswer[]}
        source={source === "drop" || source === "room" ? source : "browse"}
        roomId={room ?? null}
      />
    </main>
  );
}
