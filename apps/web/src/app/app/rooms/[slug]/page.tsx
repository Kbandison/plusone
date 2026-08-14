import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { JoinRoom, RoomComposer } from "./room-forms";

export const metadata: Metadata = { title: DRAFT_COPY.app.navRooms };

const C = DRAFT_COPY.app;

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  const { data: room } = await supabase
    .from("rooms")
    .select("id, title, description, slow_mode_seconds, pinned_resource_card")
    .eq("slug", slug)
    .maybeSingle();

  // RLS scopes rooms by community, so an absent row here may mean "not yours"
  // as easily as "does not exist" — and those look identical on purpose.
  if (!room) notFound();

  const [{ data: membership }, { data: messages }] = await Promise.all([
    supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", room.id as string)
      .eq("user_id", auth.user!.id)
      .maybeSingle(),
    supabase
      .from("room_messages")
      .select("id, user_id, body, created_at, deleted_at")
      .eq("room_id", room.id as string)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  const pinned = room.pinned_resource_card as { title?: string; body?: string } | null;

  return (
    <main id="main">
      <h1 className="text-[clamp(1.7rem,5vw,2.1rem)]">{room.title as string}</h1>
      {room.description ? (
        <p className="mt-3 text-[15.5px] leading-[1.7] text-ink-2">{room.description as string}</p>
      ) : null}

      {pinned?.title ? (
        <aside className="mt-6 rounded-xl border border-line-2 bg-surface-2 p-5">
          <h2 className="text-[1.05rem]">{pinned.title}</h2>
          {pinned.body ? <p className="mt-2 text-[14.5px] text-ink-2">{pinned.body}</p> : null}
        </aside>
      ) : null}

      <p className="mt-5 text-[13.5px] text-ink-3">
        {C.roomSlowMode(room.slow_mode_seconds as number)}
      </p>

      {/* §7.2 — NO dm button. Rooms are a place to be seen, not a directory to
          work through, and the way out of a room is a connect. */}
      <p className="mt-2 text-[13.5px] text-ink-3">{C.roomNoDmNote}</p>

      <ul className="mt-8 flex flex-col gap-4">
        {(messages ?? []).map((message) => (
          <li key={message.id as string} className="rounded-lg border border-line px-5 py-4">
            <p className="text-[15.5px] leading-[1.65]">{message.body as string}</p>
          </li>
        ))}
      </ul>

      {membership ? (
        <RoomComposer roomId={room.id as string} slug={slug} />
      ) : (
        <JoinRoom roomId={room.id as string} slug={slug} />
      )}
    </main>
  );
}
