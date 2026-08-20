import { RoomTabs } from "./room-tabs";
import { getServerSupabase } from "@/lib/supabase";

/**
 * Every room screen, under the same bar.
 *
 * A layout rather than a component each page renders, so the bar is not
 * re-fetched and re-mounted on every room change — Next keeps a layout across
 * navigations within its segment, which is exactly the behaviour a tab bar
 * wants.
 *
 * RLS scopes rooms by community, so this asks for every room and gets back only
 * the ones this member may see. The wall decides what is in the bar; nothing
 * here filters.
 */
export default async function RoomsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  // One call for the bar and one for what is in it, rather than five of each.
  // room_activity is security invoker, so the same walls apply: a room out of
  // community scope never appears, and a post from somebody you blocked does
  // not count as activity.
  const [{ data }, { data: activity }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, title")
      // The order somebody chose — see rooms.position. Slug order is
      // alphabetical by an identifier no member ever sees.
      .order("position", { ascending: true })
      .order("slug", { ascending: true }),
    supabase.rpc("room_activity"),
  ]);

  const unread = new Map(
    ((activity ?? []) as { room_id: string; unread: boolean }[]).map((row) => [
      row.room_id,
      row.unread,
    ]),
  );

  const rooms = (data ?? []).map((room) => ({
    id: room.id as string,
    title: room.title as string,
    unread: unread.get(room.id as string) ?? false,
  }));

  return (
    <>
      {rooms.length > 0 ? <RoomTabs rooms={rooms} /> : null}
      {/* The same gap again. The bar is a second piece of chrome above the
          page, so without this a room's title sat on the tab that named it. */}
      <div className="pt-6">{children}</div>
    </>
  );
}
