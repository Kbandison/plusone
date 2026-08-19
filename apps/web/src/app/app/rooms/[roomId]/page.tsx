import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { BlockButton, ReportControl } from "@/app/app/safety/safety-controls";
import { JoinRoom, RoomComposer } from "./room-forms";
import { EmptyState } from "@/app/ui";

export const metadata: Metadata = { title: DRAFT_COPY.app.navRooms };

const C = DRAFT_COPY.app;

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { data: room } = await supabase
    .from("rooms")
    .select("id, title, description, slow_mode_seconds, pinned_resource_card")
    .eq("id", roomId)
    .maybeSingle();

  // RLS scopes rooms by community, so an absent row here may mean "not yours"
  // as easily as "does not exist" — and those look identical on purpose.
  if (!room) notFound();

  const [{ data: membership }, { data: messages }] = await Promise.all([
    supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", room.id as string)
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    supabase
      .from("room_messages")
      .select("id, user_id, body, created_at, deleted_at")
      .eq("room_id", room.id as string)
      .is("deleted_at", null)
      // Descending, then reversed for display.
      //
      // This ordered ASCENDING with the same limit, which is the OLDEST hundred
      // rows — so every room froze permanently on its first hundred posts. The
      // composer kept accepting writes and the rows kept landing; members simply
      // never saw their own message appear. Descending also uses
      // room_messages_room_ix the way it was built.
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const pinned = room.pinned_resource_card as {
    title?: string;
    body?: string;
  } | null;

  return (
    <main id="main">
      <h1 className="text-h2">{room.title as string}</h1>
      {room.description ? (
        <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">{room.description as string}</p>
      ) : null}

      {pinned?.title ? (
        <aside className="mt-6 rounded-xl border border-line-2 bg-surface-2 p-5">
          <h2 className="text-[0.946rem]">{pinned.title}</h2>
          {pinned.body ? <p className="mt-2 text-[13px] text-ink-2">{pinned.body}</p> : null}
        </aside>
      ) : null}

      <p className="mt-5 text-[12.2px] text-ink-3">
        {C.roomSlowMode(room.slow_mode_seconds as number)}
      </p>

      {/* §7.2 — NO dm button. Rooms are a place to be seen, not a directory to
          work through, and the way out of a room is a connect. */}
      <p className="mt-2 text-[12.2px] text-ink-3">{C.roomNoDmNote}</p>

      <ul className="mt-8 flex flex-col gap-4">
        {(messages ?? []).length === 0 ? (
          <EmptyState heading={C.roomEmptyHeading} body={C.roomEmptyBody} />
        ) : null}

        {[...(messages ?? [])].reverse().map((message) => (
          <li key={message.id as string} className="rounded-lg border border-line px-5 py-4">
            {/* The controls below point at this id, which is what tells a
                screen reader user which post they are about to report — every
                one of them is otherwise just "Report, button". */}
            <p id={`post-${message.id as string}`} className="text-[14px] leading-[1.65]">
              {message.body as string}
            </p>
            {message.user_id !== auth.user.id ? (
              <div className="mt-3 flex items-center gap-4">
                {/* Neither control takes the author's id. Posts render with no
                    author, so shipping one to the client turned an unattributed
                    room into a name and a face for anyone reading the payload.
                    Both resolve it server-side from the message. */}
                <ReportControl
                  // h2 here: a room page's only other h2 is the pinned-resource
                  // aside, which most rooms do not have — so an h3 followed the
                  // h1 with nothing between it.
                  headingLevel={2}
                  roomMessageId={message.id as string}
                  describedBy={`post-${message.id as string}`}
                />
                <BlockButton
                  roomMessageId={message.id as string}
                  describedBy={`post-${message.id as string}`}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {membership ? (
        <RoomComposer roomId={room.id as string} />
      ) : (
        <JoinRoom roomId={room.id as string} />
      )}
    </main>
  );
}
