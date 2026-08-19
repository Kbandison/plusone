import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { chat as chatLogic } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { BlockButton, ReportControl } from "@/app/app/safety/safety-controls";
import { OverflowMenu } from "../../overflow-menu";
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

  const { data: profile } = await supabase
    .from("profiles")
    // timezone, so "12 Aug" on an older post is the member's 12 August.
    .select("timezone")
    .eq("id", auth.user.id)
    .maybeSingle();
  const zone = (profile?.timezone as string | null) ?? "UTC";

  // Read once and passed down, so every age on the page agrees with every other
  // one rather than each row reading the clock as it renders.
  const now = Date.now();

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

      {/* Both notes on one line, above the composer rather than above the
          feed. They are the rules of the room, which a member needs when they
          are about to write and not while they are reading.

          §7.2 — NO dm button. Rooms are a place to be seen, not a directory to
          work through, and the way out of a room is a connect. */}
      <p className="mt-5 text-[11px] text-ink-3">
        {C.roomSlowMode(room.slow_mode_seconds as number)} · {C.roomNoDmNote}
      </p>

      {/* The composer above the feed, where a feed puts it. Below the posts it
          was past a hundred rows of scrolling, so the room read as something to
          consume rather than somewhere to speak. */}
      <div className="mt-4">
        {membership ? (
          <RoomComposer roomId={room.id as string} />
        ) : (
          <JoinRoom roomId={room.id as string} />
        )}
      </div>

      {/* Full-bleed rows ruled off from each other, rather than a column of
          bordered cards with gaps between them.
          -mx-6/px-6 puts the rules edge to edge on a phone, which is what makes
          a feed read as one continuous surface instead of a stack of objects —
          and it is the whole difference in feel between the two. */}
      <ul className="-mx-6 mt-6 border-t border-line">
        {(messages ?? []).length === 0 ? (
          <li className="px-6 pt-6">
            <EmptyState heading={C.roomEmptyHeading} body={C.roomEmptyBody} />
          </li>
        ) : null}

        {[...(messages ?? [])].reverse().map((message) => {
          const postedAt = Date.parse(message.created_at as string);
          const mine = message.user_id === auth.user.id;

          return (
            <li
              key={message.id as string}
              className="ease-brand border-b border-line px-6 py-4 transition-colors duration-200 hover:bg-surface"
            >
              <div className="flex items-start justify-between gap-3">
                {/* The only metadata a post in here has. Rooms are
                    unattributed by construction, so there is no name and no
                    face to sit beside it — which is why the body starts at the
                    left edge rather than in a column beside an avatar. */}
                <time
                  dateTime={new Date(postedAt).toISOString()}
                  title={chatLogic.messageTimeExact(postedAt, zone)}
                  className="text-[11px] text-ink-3 tabular-nums"
                >
                  {chatLogic.compactAge(postedAt, now, zone)}
                </time>

                {!mine ? (
                  <OverflowMenu label={C.postMenuLabel} compact>
                    <div className="py-3">
                      {/* Neither control takes the author's id. Posts render
                          with no author, so shipping one to the client turned
                          an unattributed room into a name and a face for
                          anyone reading the payload. Both resolve it
                          server-side from the message. */}
                      <ReportControl
                        roomMessageId={message.id as string}
                        describedBy={`post-${message.id as string}`}
                      />
                    </div>
                    <div className="py-3">
                      <BlockButton
                        roomMessageId={message.id as string}
                        describedBy={`post-${message.id as string}`}
                      />
                    </div>
                  </OverflowMenu>
                ) : null}
              </div>

              {/* The controls above point at this id, which is what tells a
                  screen reader user which post they are about to report —
                  every one of them is otherwise just "Report, button". */}
              <p
                id={`post-${message.id as string}`}
                className="mt-1 text-[13.5px] leading-[1.6] whitespace-pre-wrap"
              >
                {message.body as string}
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
