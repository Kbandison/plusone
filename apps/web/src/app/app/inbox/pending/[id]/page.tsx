import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DRAFT_COPY, promptQuestion } from "@plusone/config";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../../../member-photo";
import { AcceptForm, DeclineForm } from "../../inbox-forms";

const C = DRAFT_COPY.app;

export const metadata: Metadata = { title: C.threadNeedsDecision };

/**
 * One decision, with room to make it.
 *
 * Decision #14: the reply to a prompt IS the connect — no name, no photo, you
 * decide on what somebody said. That argues for giving it a screen rather than
 * a line in a list: accepting cannot be undone, and a row in a scroll is the
 * wrong place for an irreversible choice made in a hurry.
 *
 * The bubbles in the inbox are for scanning; this is for deciding.
 */
export default async function PendingConnectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { data: connect } = await supabase
    .from("connects")
    .select("id, prompt_id, prompt_reply, initiator_id, target_id, status, expires_at")
    .eq("id", id)
    .maybeSingle();

  // Not yours, already decided, or gone. RLS answers the first; the status test
  // is what stops a decided connect being decided again from a stale tab.
  if (!connect || connect.target_id !== auth.user.id || connect.status !== "pending") notFound();

  const otherId = connect.initiator_id as string;
  const [{ data: profile }, photos] = await Promise.all([
    supabase.from("visible_profiles").select("display_name, age").eq("id", otherId).maybeSingle(),
    photosFor([otherId]),
  ]);

  const question = promptQuestion(connect.prompt_id as string);

  return (
    <main id="main">
      <Link
        href="/app/inbox"
        className="ease-brand inline-flex min-h-tap items-center text-[11.7px] text-ink-3 transition-colors duration-200 hover:text-ink"
      >
        <span aria-hidden="true" className="mr-1.5">
          &larr;
        </span>
        {C.navInbox}
      </Link>

      <div className="mt-4 flex items-center gap-4">
        <MemberPhotoFrame photo={photos.get(otherId)} size={72} />
        <div>
          <h1 className="text-h3">{profile?.display_name ?? C.threadUnknownPerson}</h1>
          {profile?.age ? <p className="mt-1 text-[11.7px] text-ink-3">{profile.age}</p> : null}
        </div>
      </div>

      {/* The reply, with the question above it. Without the question a reply is
          half a sentence — "three, so you would be busy" decides nothing. */}
      <figure className="mt-8 rounded-xl border border-line-2 bg-surface p-6">
        {question ? (
          <figcaption className="text-[11px] tracking-[0.02em] text-ink-3 uppercase">
            {question}
          </figcaption>
        ) : null}
        <blockquote id="reply" className="mt-2 text-[13.8px] leading-[1.65]">
          {connect.prompt_reply as string}
        </blockquote>
      </figure>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <AcceptForm connectId={connect.id as string} describedBy="reply" />
        <DeclineForm connectId={connect.id as string} describedBy="reply" />
      </div>

      {/* §2 #14 — no interaction ends in silence, so a decline still sends a
          note. Saying so before the button is pressed is what stops Decline
          reading as "ignore". */}
      <p className="mt-5 text-[11px] leading-[1.6] text-ink-3">{C.declineNote}</p>
    </main>
  );
}
