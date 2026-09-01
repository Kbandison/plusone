import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { Hint } from "../hint";

export const metadata: Metadata = { title: DRAFT_COPY.app.navRooms };

const C = DRAFT_COPY.app;

/**
 * /app/rooms has nothing of its own to show any more.
 *
 * It was a list of five identical cards whose only job was to get you into a
 * room; the bar in the layout does that from everywhere now, so a page that
 * repeats it is a stop on the way to somewhere with nothing on it.
 *
 * Straight into the first room in scope. RLS decides which rooms come back, so
 * "first" is first among the ones this member may see — there is no case where
 * this lands somewhere they are not allowed.
 */
export default async function RoomsPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("rooms")
    .select("id")
    // The order somebody chose — see rooms.position. Slug is
    // alphabetical by an identifier no member ever sees.
    .order("position", { ascending: true })
    .order("slug", { ascending: true })
    .limit(1);

  const first = (data ?? [])[0];
  if (first) redirect(`/app/rooms/${first.id as string}`);

  // No rooms in scope at all. Not reachable today — two of the five are scoped
  // 'all' — but a community with no rooms is a configuration, not an
  // impossibility, and an empty page beats a redirect to nowhere.
  return (
    <main id="main">
      <h1 className="text-h2">{C.roomsHeading}</h1>

      <Hint id="rooms-are-not-dating" />
      <p className="mt-8 text-[13px] text-ink-2">{C.roomsEmpty}</p>
    </main>
  );
}
