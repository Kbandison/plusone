import type { Metadata } from "next";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";
import { chat as chatLogic } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { parseClientEnv } from "@plusone/config";
import { BlockButton, ReportControl } from "@/app/app/safety/safety-controls";
import { photosFor } from "@/lib/photo-urls";
import { PostRow, type Post } from "./post-row";
import { JoinRoom } from "./room-forms";
import { RoomCompose } from "./compose";
import { RoomSearch } from "./room-search";
import { EmptyState } from "@/app/ui";

export const metadata: Metadata = { title: DRAFT_COPY.app.navRooms };

const C = DRAFT_COPY.app;

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { roomId } = await params;
  const { q } = await searchParams;
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { data: room } = await supabase
    .from("rooms")
    .select("id, title, description, pinned_resource_card")
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
  // after(), not `void`.
  //
  // A PostgrestBuilder is a thenable: the request is made inside then(), so
  // `void supabase.rpc(...)` built the call and threw it away without ever
  // sending it. Four places did this — both view recorders, mark_room_read and
  // mark_chat_read — so read markers never cleared and the view count sat at
  // nought forever, silently, because a fire-and-forget failure looks exactly
  // like a fire-and-forget success.
  //
  // after() runs the work once the response has been sent, which is what the
  // `void` was reaching for: no latency added to the render, and the promise is
  // actually awaited rather than dropped.
  after(async () => {
    await supabase.rpc("mark_room_read", { p_room_id: room.id as string });
  });

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
    supabase.rpc("room_feed", {
      p_room_id: room.id as string,
      p_limit: 100,
      p_search: q ?? null,
    }),
  ]);

  // Everything the client is allowed to know about who wrote what. There is no
  // branch in room_feed where an anonymous post carries an author id, so there
  // is no bug here that could reveal one — the shape of the data is the wall.
  const posts = (feed ?? []) as Post[];

  // A room of articles rather than of people. Read off the posts rather than
  // off the slug: the rule is "nobody here wrote these", and the slug is a
  // name somebody chose.
  const isNews = posts.length > 0 && posts.every((post) => post.article_url !== null);

  // Where this member could share something to. One call for the page rather
  // than one per row.
  const { data: shareRoomRows } = await supabase.rpc("rooms_i_can_share_into", {
    p_except: room.id as string,
  });
  const shareRooms = (shareRoomRows ?? []) as { id: string; title: string }[];

  // Absolute, because a shared link leaves this app: a relative one pasted into
  // a message goes nowhere.
  const { NEXT_PUBLIC_APP_URL: appUrl } = parseClientEnv(process.env);

  // Seen, recorded once for the page. Fire-and-forget like mark_room_read: a
  // failed write means a count is one short, which is a far better outcome than
  // a room that will not open because bookkeeping failed.
  //
  // "Seen" means it came up in your feed, which is what every feed counts and
  // is why the copy says seen rather than read.
  if (posts.length > 0) {
    after(async () => {
      await supabase.rpc("record_room_views", {
        p_message_ids: posts.map((post) => post.id),
      });
    });
  }

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

      {/* An article room has nobody in it to reach and nothing for a member
          to post, so it gets neither line and neither control — it gets the
          thing somebody in a room of headlines actually wants.

          §7.2 — NO dm button. Rooms are a place to be seen, not a directory to
          work through, and the way out of a room is a connect. */}
      {isNews ? (
        <RoomSearch roomId={room.id as string} />
      ) : (
        <>
          <p className="mt-5 text-[11px] text-ink-3">{C.roomNoDmNote}</p>

          {/* A box the width of the column, and no button beside it. */}
          {membership ? (
            <RoomCompose roomId={room.id as string} />
          ) : (
            <div className="mt-4">
              <JoinRoom roomId={room.id as string} />
            </div>
          )}
        </>
      )}

      {/* Full-bleed rows ruled off from each other, rather than a column of
          bordered cards with gaps between them.
          -mx-6/px-6 puts the rules edge to edge on a phone, which is what makes
          a feed read as one continuous surface instead of a stack of objects —
          and it is the whole difference in feel between the two. */}
      <ul className="-mx-6 mt-6 border-t border-line">
        {posts.length === 0 ? (
          <li className="px-6 pt-6">
            {/* A room with nothing in it and a search that found nothing are
                different facts, and telling somebody the room is empty when
                they have just typed something is answering a question they did
                not ask. */}
            {q ? (
              <p className="text-[12.6px] text-ink-2">{C.roomSearchEmpty(q)}</p>
            ) : (
              <EmptyState heading={C.roomEmptyHeading} body={C.roomEmptyBody} />
            )}
          </li>
        ) : null}

        {posts.map((post) => (
          <li
            key={post.id}
            className="ease-brand relative border-b border-line px-6 py-4 transition-colors duration-200 hover:bg-surface"
          >
            {/* The whole row opens the thread, and the comment count still
                does too — one is where a member reaches for it and the other
                is what they aim at when they mean the comments. */}
            <PostRow
              post={post}
              photo={post.author_id ? authorPhotos.get(post.author_id) : undefined}
              zone={zone}
              now={now}
              href={`/app/rooms/${room.id as string}/${post.id}`}
              commentHref={`/app/rooms/${room.id as string}/${post.id}`}
              shareUrl={`${appUrl}/app/rooms/${room.id as string}/${post.id}`}
              shareRooms={shareRooms}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
