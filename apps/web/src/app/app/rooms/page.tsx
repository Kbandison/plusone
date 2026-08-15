import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

export const metadata: Metadata = { title: DRAFT_COPY.app.navRooms };

const C = DRAFT_COPY.app;

/**
 * The room list (§7.2). Scoped by community in RLS, so this query asks for
 * every room and gets back only the ones this member may see.
 */
export default async function RoomsPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("rooms")
    .select("id, slug, title, description")
    .order("slug", { ascending: true });

  const rooms = data ?? [];

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{C.roomsHeading}</h1>

      {rooms.length === 0 ? (
        <p className="mt-8 text-[16px] text-ink-2">{C.roomsEmpty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {rooms.map((room) => (
            <li key={room.id as string}>
              <Link
                // By id, not slug. Two of the §5.2 slugs name a condition and
                // §8 keeps those out of paths — history, autocomplete on a
                // borrowed phone, our access logs, Referer headers.
                href={`/app/rooms/${room.id as string}`}
                className="ease-brand block rounded-xl border border-line-2 bg-surface px-6 py-5 transition-colors duration-200 hover:border-ink-3"
              >
                <h2 className="text-[1.15rem]">{room.title as string}</h2>
                {room.description ? (
                  <p className="mt-1.5 text-[14.5px] text-ink-2">{room.description as string}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
