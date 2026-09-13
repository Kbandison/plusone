import { notFound, redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";

/**
 * Where a room notification lands: one uuid in, the thread out.
 *
 * `pathFor` gets a single id and a thread lives at /app/rooms/<room>/<post>,
 * which needs two. The subject already travelling is the message that was
 * replied to, liked, or mentioned in; this resolves the rest.
 *
 * ── it must 404 rather than redirect, for somebody who cannot see it ───────
 *
 * A post id is opaque, but a resolver that redirected regardless would put
 * /app/rooms/<a room named for a diagnosis>/… into the history of somebody with
 * no access to it. `room_post_root` runs as the caller and room_messages' read
 * policy is the access check, so an unreachable post comes back empty and this
 * returns notFound() — the same answer a made-up id gets, which is the point:
 * the two must be indistinguishable.
 *
 * ── force-dynamic, because the answer is per member ────────────────────────
 *
 * The same url resolves for one member and 404s for another. Cached, the first
 * answer would be served to the second.
 */
export const dynamic = "force-dynamic";

/** Checked before the query, so a malformed id never reaches Postgres as one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ResolvePost({ params }: { params: Promise<{ post: string }> }) {
  const { post } = await params;
  if (!UUID.test(post)) notFound();

  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("room_post_root", { p_message_id: post });

  const row = (data ?? [])[0] as { room_id: string; root_id: string } | undefined;
  if (!row) notFound();

  redirect(`/app/rooms/${row.room_id}/${row.root_id}`);
}
