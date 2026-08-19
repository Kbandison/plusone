import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DRAFT_COPY, renderClosureTemplate } from "@plusone/config";
import { fuse } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { CancelPlan, CloseChat, Composer, ConfirmPlan, ProposePlan } from "./chat-forms";
import { VoiceRecorder } from "./voice-recorder";
import { BlockButton, ReportControl } from "@/app/app/safety/safety-controls";
import { EmptyState } from "@/app/ui";

export const metadata: Metadata = { title: DRAFT_COPY.app.navChats };

const C = DRAFT_COPY.app;

/**
 * The shape propose_date_plan actually stores.
 *
 * This was declared flat and camelCase — date, time, place, proposedBy,
 * confirmedBy — while the RPC writes jsonb_build_object('plan', p_plan,
 * 'proposed_by', ..., 'confirmed_by', null): snake_case, with the three fields
 * nested one level down. date_plan is untyped jsonb passed through an `as`, so
 * TypeScript could not see it, and EVERY field read as undefined at runtime.
 *
 * Two things followed. `canConfirm={plan.proposedBy !== me}` was
 * `undefined !== me`, always true, so the proposer was offered a Confirm button
 * that the RPC then refused. And the plan itself — the day, the time, the place
 * — was never rendered to either member, so a chat could reach date_planned
 * without anyone being shown what had been agreed.
 */
interface Plan {
  plan: { date: string; time: string; place: string };
  proposed_by: string;
  confirmed_by: string | null;
}

/**
 * Plays a voice note through a signed URL, minted per render.
 *
 * The bucket is private and the storage policy checks chat participation, so
 * the URL is short-lived and only obtainable by someone already entitled to
 * hear it. A public path would be a permanent link to somebody's actual voice.
 */
async function VoiceNote({ path, seconds }: { path: string; seconds: number | null }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.storage.from("voice-notes").createSignedUrl(path, 60 * 10);

  if (!data?.signedUrl) return <span className="text-[13.9px] text-ink-3">Voice note</span>;

  return (
    <span className="flex items-center gap-3">
      {/* A bare <audio controls> is announced as "audio player" with no
          indication of whose voice it is or how long it runs. */}
      <audio
        src={data.signedUrl}
        controls
        preload="none"
        aria-label={C.voiceNoteAria(seconds)}
        className="max-w-full"
      />
      {seconds ? <span className="text-[13px] text-ink-3">{seconds}s</span> : null}
    </span>
  );
}

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");
  const me = auth.user.id;

  // RLS decides whether this chat is the member's to read. A row coming back
  // empty here is the wall working, not a missing record.
  const { data: chat } = await supabase
    .from("chats")
    .select(
      "id, connect_id, status, fuse_expires_at, date_plan, closure_template, closure_personal_line, closed_by",
    )
    .eq("id", id)
    .maybeSingle();

  if (!chat) notFound();

  // Opening a thread is what makes it read. Fire-and-forget on purpose: a
  // failed marker means the inbox shows a dot a moment longer, which is a far
  // better outcome than a conversation that will not open because bookkeeping
  // failed. It is also why the RPC takes no timestamp — the database supplies
  // one, so a client cannot mark a thread read into the future.
  void supabase.rpc("mark_chat_read", { p_chat_id: id });

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, body, voice_note_path, voice_note_seconds, created_at")
    .eq("chat_id", id)
    .order("created_at", { ascending: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", me)
    .maybeSingle();

  // The other participant, for the safety controls. Read from the connect
  // rather than the messages, so it is present even in a chat with none.
  const { data: connect } = await supabase
    .from("connects")
    .select("initiator_id, target_id")
    .eq("id", chat.connect_id as string)
    .maybeSingle();
  const other = connect
    ? (connect.initiator_id as string) === me
      ? (connect.target_id as string)
      : (connect.initiator_id as string)
    : null;

  // The other person's name, for the heading and for attributing each message.
  // visible_profiles rather than profiles: it applies the same wall the rest of
  // the app does, so a member who has since blocked you or left dating simply
  // has no name here rather than leaking one.
  const { data: otherProfile } = other
    ? await supabase.from("visible_profiles").select("display_name").eq("id", other).maybeSingle()
    : { data: null };
  const otherName = (otherProfile?.display_name as string | null) ?? null;
  const myName = (profile?.display_name as string | null) ?? null;

  const plan = (chat.date_plan ?? null) as Plan | null;
  const countdown = fuse.countdown(
    {
      status: chat.status as never,
      fuseExpiresAt: chat.fuse_expires_at ? Date.parse(chat.fuse_expires_at) : null,
      plan: null,
      closure: null,
    },
    Date.now(),
  );

  const isTerminal = ["closed_fuse", "closed_by_member", "graduated"].includes(chat.status);

  return (
    <main id="main">
      {/* Every page needs one. Without it the first heading here was an h2 and
          a member navigating by heading landed mid-hierarchy with no idea whose
          chat they were in. */}
      <h1 className="sr-only">{otherName ?? C.chatsHeading}</h1>

      {/* The fuse, visible (§7.2). A timer you have to go looking for is a
          deadline that surprises people. */}
      {countdown.isRunning ? (
        <p className={`text-[13.4px] ${countdown.isExpiringSoon ? "text-caution" : "text-ink-3"}`}>
          {countdown.isExpiringSoon ? C.fuseExpiringSoon : C.fuseDaysLeft(countdown.remainingDays)}
        </p>
      ) : chat.status === "date_planned" ? (
        <p className="text-[13.4px] text-positive">{C.datePlannedLabel}</p>
      ) : null}

      <ul className="mt-6 flex flex-col gap-3">
        {(messages ?? []).length === 0 ? (
          <EmptyState heading={C.chatEmptyHeading} body={C.chatEmptyBody} />
        ) : null}

        {(messages ?? []).map((message) => (
          <li
            key={message.id as string}
            /* Own messages are surface-2 with an accent edge, not an accent
               FILL. The token file's own contract reads "CTAs, links,
               highlights, interactive states — never large fills", restating
               the design system's colour rule; a column of accent-filled
               bubbles is the largest fill in the app and it makes every real
               control on the screen compete with the conversation. Alignment
               and the edge carry the same distinction more quietly. */
            className={`max-w-[85%] rounded-xl px-4 py-3 text-[14.9px] leading-[1.6] ${
              message.sender_id === me
                ? "self-end border-r-2 border-accent bg-surface-2 text-ink"
                : "border-l-2 border-line-2 bg-surface text-ink"
            }`}
          >
            {/* Who said it. Colour and alignment were the only signal, so a
                screen reader heard an undifferentiated run of sentences with no
                way to tell your own words from theirs. Names the page already
                has, rather than a label invented for the purpose. */}
            {(message.sender_id === me ? myName : otherName) ? (
              <span className="sr-only">{message.sender_id === me ? myName : otherName}: </span>
            ) : null}
            {message.voice_note_path ? (
              <VoiceNote
                path={message.voice_note_path as string}
                seconds={message.voice_note_seconds as number | null}
              />
            ) : (
              (message.body as string)
            )}
          </li>
        ))}
      </ul>

      {isTerminal ? (
        // Every terminal state carries a note. Silence is impossible by
        // construction (§6.2) — so this branch always has something to show.
        <section className="mt-8 rounded-xl border border-line-2 bg-surface p-6">
          <h2 className="text-[1.103rem]">{C.closedNoteHeading}</h2>
          <p className="mt-4 text-[14.9px] leading-[1.7] text-ink-2">
            {/* Signed, which it was not.
                renderClosureTemplate strips the "— {name}" line entirely when no
                name is given, so the delivered note lost the signature the
                composer's preview showed — under a comment in chat-forms.tsx
                reading "Exactly what they will receive, before it is sent". A
                fuse close has no closer, and null there keeps it correctly
                unsigned. */}
            {renderClosureTemplate(
              (chat.closure_template as number | null) ?? 0,
              chat.closed_by === me ? myName : chat.closed_by ? otherName : null,
            )}
            {chat.closure_personal_line ? ` ${chat.closure_personal_line as string}` : ""}
          </p>
        </section>
      ) : (
        <>
          <Composer chatId={id} />
          <VoiceRecorder chatId={id} />

          {chat.status === "open" && !plan ? <ProposePlan chatId={id} /> : null}

          {/* The plan itself, which nothing rendered. A chat could reach
              date_planned with neither member ever shown what was agreed. */}
          {plan ? (
            <section className="mt-8 rounded-xl border border-line-2 bg-surface p-5">
              <h2 className="text-[1.009rem]">{C.datePlannedLabel}</h2>
              <p className="mt-2 text-[14.9px] leading-[1.65] text-ink-2">
                {plan.plan.date} · {plan.plan.time} · {plan.plan.place}
              </p>
            </section>
          ) : null}

          {/* Confirm and cancel are independent states, and were one flag.
              ConfirmPlan carried the cancel control inside it and rendered only
              when status !== 'date_planned' — while cancel_date_plan refuses
              unless status IS 'date_planned'. The two conditions are exact
              complements, so cancel was mounted precisely where it always
              failed and absent from the only state where it works. §6.2 says a
              cancelled plan returns the chat to the fuse; there was no path. */}
          {plan && chat.status !== "date_planned" ? (
            <ConfirmPlan chatId={id} canConfirm={plan.proposed_by !== me} />
          ) : null}

          {chat.status === "date_planned" ? <CancelPlan chatId={id} /> : null}

          <CloseChat chatId={id} senderName={(profile?.display_name as string) ?? ""} />

          {/* Always reachable, never prominent. Someone who needs this should
              not have to hunt; nobody else should be nudged toward it. */}
          {other ? (
            <div className="mt-8 flex items-center gap-4 border-t border-line pt-6">
              <ReportControl memberId={other} />
              <BlockButton memberId={other} />
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
