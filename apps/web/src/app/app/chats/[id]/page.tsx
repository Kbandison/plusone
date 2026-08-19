import { Fragment } from "react";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DRAFT_COPY, promptQuestion, renderClosureTemplate } from "@plusone/config";
import { chat as chatLogic, fuse } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { CancelPlan, CloseChat, Composer, ConfirmPlan, ProposePlan } from "./chat-forms";
import { VoiceRecorder } from "./voice-recorder";
import { OverflowMenu } from "../../overflow-menu";
import { TextBubble } from "./text-bubble";
import { VoiceNote } from "./voice-note";
import { MemberPhotoFrame } from "../../member-photo";
import { photosFor } from "@/lib/photo-urls";
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
    // timezone, so a message sent at 22:30 says 22:30 to the person who sent
    // it rather than whatever that was in UTC.
    .select("display_name, timezone")
    .eq("id", me)
    .maybeSingle();

  // The other participant, for the safety controls. Read from the connect
  // rather than the messages, so it is present even in a chat with none.
  const { data: connect } = await supabase
    .from("connects")
    .select("initiator_id, target_id, prompt_id, prompt_reply")
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
  const otherPhoto = other ? (await photosFor([other])).get(other) : undefined;
  const myName = (profile?.display_name as string | null) ?? null;
  const zone = (profile?.timezone as string | null) ?? "UTC";

  // Read once, and passed down, so every label on the page agrees with every
  // other one — and so the server's answer is the answer, rather than a value
  // each bubble reads for itself as it renders.
  const now = Date.now();

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
      {/* The h1 this page needs, and no longer sr-only. It was hidden because
          nothing else identified the chat; now it is the identification —
          a member navigating by heading lands on whose conversation this is,
          and so does everyone else.

          Beside it, everything that ends the conversation, folded behind one
          press. Close, report and block were three controls stacked under the
          composer, which put ending it in the same column as continuing it. */}
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        {/* A face with the name. Every other surface that names a member shows
            them — the inbox rows, the Drop, the connect screen — and the chat,
            the one place you are actually talking to them, showed a string. */}
        <div className="flex min-w-0 items-center gap-3">
          <MemberPhotoFrame photo={otherPhoto} size={34} />
          <h1 className="truncate text-h3">{otherName ?? C.chatsHeading}</h1>
        </div>

        {/* Report and block hung off the live-chat branch, so they vanished the
            moment a chat closed — taking them away from the member most likely
            to want them, who is the one the conversation just went wrong with.
            Closing is the only part of this that a terminal chat has no use
            for. */}
        <OverflowMenu>
          {/* Each in its own row, so the menu's divide-y rules between them.
              A fragment here would not do — its children become siblings of the
              menu, and the dividers would land in the wrong places. */}
          {!isTerminal ? (
            <div className="py-3">
              <CloseChat chatId={id} senderName={(profile?.display_name as string) ?? ""} />
            </div>
          ) : null}
          {other ? (
            <div className="py-3">
              <ReportControl memberId={other} />
            </div>
          ) : null}
          {other ? (
            <div className="py-3">
              <BlockButton memberId={other} />
            </div>
          ) : null}
        </OverflowMenu>
      </div>

      {/* What was actually said first.
          A connect IS a prompt and a reply (Decision #14) — no name, no photo,
          you decide on what somebody wrote. Accepting one opened a chat that
          said "Nobody has written yet", which was not true and threw away the
          only thing the two people had between them at the moment it stopped
          being a decision and became a conversation. */}
      {connect?.prompt_reply ? (
        <figure className="mt-8 rounded-xl border border-line-2 bg-ground p-5">
          <figcaption className="text-[11px] tracking-[0.02em] text-ink-3 uppercase">
            {promptQuestion(connect.prompt_id as string)}
          </figcaption>
          <blockquote className="mt-2 text-[13.5px] leading-[1.6]">
            {connect.prompt_reply as string}
          </blockquote>
          <p className="mt-3 text-[10.5px] text-ink-3">{C.chatOriginNote}</p>
        </figure>
      ) : null}

      <ul className="mt-6 flex flex-col gap-3">
        {(messages ?? []).length === 0 ? (
          <EmptyState heading={C.chatEmptyHeading} body={C.chatEmptyBody} />
        ) : null}

        {(messages ?? []).map((message, index) => {
          const sentAt = Date.parse(message.created_at as string);
          const previous =
            index > 0 ? Date.parse((messages ?? [])[index - 1]!.created_at as string) : null;
          const mine = message.sender_id === me;
          const who = mine ? myName : otherName;

          return (
            <Fragment key={message.id as string}>
              {/* A day between two messages is a different conversation wearing
                  the same thread. Said once, not on every bubble. */}
              {chatLogic.needsDateSeparator(previous, sentAt, zone) ? (
                <li className="mt-4 self-center text-[11px] text-ink-3 first:mt-0">
                  {chatLogic.dateSeparatorLabel(sentAt, now, zone)}
                </li>
              ) : null}

              {message.voice_note_path ? (
                // Not a TextBubble: an <audio controls> inside a button is
                // invalid and the browser's play control stops working. So a
                // voice note wears its time openly rather than behind a press.
                <li
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-[12.6px] leading-[1.6] ${
                    mine
                      ? "self-end border-r-2 border-accent bg-surface-2 text-ink"
                      : "border-l-2 border-line-2 bg-surface text-ink"
                  }`}
                >
                  {who ? <span className="sr-only">{who}: </span> : null}
                  <VoiceNote
                    path={message.voice_note_path as string}
                    seconds={message.voice_note_seconds as number | null}
                  />
                  <time
                    dateTime={new Date(sentAt).toISOString()}
                    title={chatLogic.messageTimeExact(sentAt, zone)}
                    className="mt-1.5 block text-[10.5px] text-ink-3"
                  >
                    {chatLogic.messageTimeLabel(sentAt, now, zone)}
                  </time>
                </li>
              ) : (
                <TextBubble
                  mine={mine}
                  who={who}
                  body={message.body as string}
                  label={chatLogic.messageTimeLabel(sentAt, now, zone)}
                  exact={chatLogic.messageTimeExact(sentAt, zone)}
                  iso={new Date(sentAt).toISOString()}
                />
              )}
            </Fragment>
          );
        })}
      </ul>

      {isTerminal ? (
        // Every terminal state carries a note. Silence is impossible by
        // construction (§6.2) — so this branch always has something to show.
        <section className="mt-8 rounded-xl border border-line-2 bg-surface p-6">
          <h2 className="text-[0.931rem]">{C.closedNoteHeading}</h2>
          <p className="mt-4 text-[12.6px] leading-[1.7] text-ink-2">
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
          {/* The fuse, still visible (§7.2), but next to the thing it is a
              deadline for. At the top of the screen it was a number a member
              scrolled past on the way to the conversation; above the box they
              are about to type in, it is the reason to type. */}
          {countdown.isRunning ? (
            <p
              className={`mt-6 text-[11.3px] ${countdown.isExpiringSoon ? "text-caution" : "text-ink-3"}`}
            >
              {countdown.isExpiringSoon
                ? C.fuseExpiringSoon
                : C.fuseDaysLeft(countdown.remainingDays)}
            </p>
          ) : chat.status === "date_planned" ? (
            <p className="mt-6 text-[11.3px] text-positive">{C.datePlannedLabel}</p>
          ) : null}

          <Composer chatId={id} />

          {/* One row: the microphone and the date proposal, side by side under
              the box. Both were full-width blocks stacked below it, so the two
              optional things took more of the screen than the message field. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <VoiceRecorder chatId={id} />
            {chat.status === "open" && !plan ? <ProposePlan chatId={id} /> : null}
          </div>

          {/* The plan itself, which nothing rendered. A chat could reach
              date_planned with neither member ever shown what was agreed. */}
          {plan ? (
            <section className="mt-8 rounded-xl border border-line-2 bg-surface p-5">
              <h2 className="text-[0.851rem]">{C.datePlannedLabel}</h2>
              <p className="mt-2 text-[12.6px] leading-[1.65] text-ink-2">
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
        </>
      )}
    </main>
  );
}
