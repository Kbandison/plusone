import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { chat as chatLogic } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { BlockButton, ReportControl } from "@/app/app/safety/safety-controls";
import { OverflowMenu } from "../../overflow-menu";
import { MemberPhotoFrame } from "../../member-photo";
import { photosFor } from "@/lib/photo-urls";
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

  const [{ data: membership }, { data: feed }] = await Promise.all([
    supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", room.id as string)
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    supabase.rpc("room_feed", { p_room_id: room.id as string, p_limit: 100 }),
  ]);

  // Everything the client is allowed to know about who wrote what. There is no
  // branch in room_feed where an anonymous post carries an author id, so there
  // is no bug here that could reveal one — the shape of the data is the wall.
  const posts = (feed ?? []) as {
    id: string;
    body: string;
    created_at: string;
    anonymous: boolean;
    author_id: string | null;
    author_name: string | null;
    is_mine: boolean;
  }[];

  // Photos only for the authors who chose to be named. photosFor reads
  // visible_profile_photos, so a member whose photos are blurred until
  // connected stays blurred here too — attribution is a choice about a name,
  // not a waiver of every other privacy setting.
  const authorPhotos = await photosFor([
    ...new Set(posts.map((post) => post.author_id).filter((id): id is string => id !== null)),
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
        {posts.length === 0 ? (
          <li className="px-6 pt-6">
            <EmptyState heading={C.roomEmptyHeading} body={C.roomEmptyBody} />
          </li>
        ) : null}

        {posts.map((post) => {
          const postedAt = Date.parse(post.created_at);

          return (
            <li
              key={post.id}
              className="ease-brand border-b border-line px-6 py-4 transition-colors duration-200 hover:bg-surface"
            >
              <div className="flex items-start gap-3">
                {/* An anonymous author has no photo to show, so the frame's
                    empty state is the placeholder — the same neutral shape a
                    member with no photo gets, rather than a second thing to
                    learn the meaning of. */}
                <MemberPhotoFrame
                  photo={post.author_id ? authorPhotos.get(post.author_id) : undefined}
                  size={34}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-[13px]">
                        {post.author_name ?? C.threadUnknownPerson}
                      </span>
                      {post.anonymous ? (
                        // Said plainly. A pseudonym that does not announce
                        // itself is a name a reader will take for a real one.
                        <span className="shrink-0 text-[10.5px] text-ink-3">{C.postAnonymous}</span>
                      ) : null}
                      <time
                        dateTime={new Date(postedAt).toISOString()}
                        title={chatLogic.messageTimeExact(postedAt, zone)}
                        className="shrink-0 text-[11px] text-ink-3 tabular-nums"
                      >
                        {chatLogic.compactAge(postedAt, now, zone)}
                      </time>
                    </p>

                    {!post.is_mine ? (
                      <OverflowMenu label={C.postMenuLabel} compact>
                        <div className="py-3">
                          {/* Neither control takes an author id, and for an
                              anonymous post the client does not have one.
                              Both resolve it server-side from the message. */}
                          <ReportControl roomMessageId={post.id} describedBy={`post-${post.id}`} />
                        </div>
                        <div className="py-3">
                          <BlockButton roomMessageId={post.id} describedBy={`post-${post.id}`} />
                        </div>
                      </OverflowMenu>
                    ) : null}
                  </div>

                  {/* The controls above point at this id, which is what tells a
                      screen reader user which post they are about to report —
                      every one of them is otherwise just "Report, button". */}
                  <p
                    id={`post-${post.id}`}
                    className="mt-1 text-[13.5px] leading-[1.6] whitespace-pre-wrap"
                  >
                    {post.body}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
