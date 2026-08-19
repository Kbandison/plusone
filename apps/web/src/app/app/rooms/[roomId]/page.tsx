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

  // Opening a room is what makes it read. Fire-and-forget on purpose, exactly
  // as the chat page does it: a failed marker means a dot stays on the tab a
  // moment longer, which is a far better outcome than a room that will not open
  // because bookkeeping failed. The RPC takes no timestamp — the database
  // supplies one, so a client cannot mark a room read into the future.
  void supabase.rpc("mark_room_read", { p_room_id: room.id as string });

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
    url?: string;
    urlLabel?: string;
  } | null;

  return (
    <main id="main">
      <h1 className="text-h2">{room.title as string}</h1>
      {room.description ? (
        <p className="mt-3 text-[12.6px] leading-[1.7] text-ink-2">{room.description as string}</p>
      ) : null}

      {pinned?.title ? (
        <aside className="mt-6 rounded-xl border border-line-2 bg-surface-2 p-5">
          <h2 className="text-[0.851rem]">{pinned.title}</h2>
          {pinned.body ? <p className="mt-2 text-[11.7px] text-ink-2">{pinned.body}</p> : null}

          {pinned.url ? (
            <a
              href={pinned.url}
              target="_blank"
              /**
               * noreferrer, and it is the whole point.
               *
               * Without it the destination receives a Referer header reading
               * /app/rooms/<id> — so an outside site learns that whoever just
               * arrived came from a room in this product. §8 keeps condition
               * words out of our own paths for exactly this class of reason;
               * handing the visit itself to a third party undoes that on the
               * one screen where the member is most likely to click out.
               *
               * noopener comes with noreferrer in every current browser, and is
               * named anyway because the two get separated by a well-meaning
               * edit.
               */
              rel="noopener noreferrer"
              className="ease-brand mt-4 inline-flex min-h-tap items-center text-[11.7px] text-accent underline decoration-line-control underline-offset-4 transition-colors duration-200 hover:decoration-accent"
            >
              {pinned.urlLabel ?? pinned.url}
            </a>
          ) : null}
        </aside>
      ) : null}

      <p className="mt-5 text-[11px] text-ink-3">
        {C.roomSlowMode(room.slow_mode_seconds as number)}
      </p>

      {/* §7.2 — NO dm button. Rooms are a place to be seen, not a directory to
          work through, and the way out of a room is a connect. */}
      <p className="mt-2 text-[11px] text-ink-3">{C.roomNoDmNote}</p>

      <ul className="mt-8 flex flex-col gap-4">
        {(messages ?? []).length === 0 ? (
          <EmptyState heading={C.roomEmptyHeading} body={C.roomEmptyBody} />
        ) : null}

        {[...(messages ?? [])].reverse().map((message) => (
          <li key={message.id as string} className="rounded-lg border border-line px-5 py-4">
            {/* The controls below point at this id, which is what tells a
                screen reader user which post they are about to report — every
                one of them is otherwise just "Report, button". */}
            <p id={`post-${message.id as string}`} className="text-[12.6px] leading-[1.65]">
              {message.body as string}
            </p>
            {message.user_id !== auth.user.id ? (
              <div className="mt-3 flex items-center gap-4">
                {/* Neither control takes the author's id. Posts render with no
                    author, so shipping one to the client turned an unattributed
                    room into a name and a face for anyone reading the payload.
                    Both resolve it server-side from the message. */}
                {/* headingLevel is gone: the form opens in a modal now, and
                    showModal() makes the rest of the page inert, so the
                    dialog's outline is its own. The level no longer depends on
                    what the page behind it happens to contain. */}
                <ReportControl
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
