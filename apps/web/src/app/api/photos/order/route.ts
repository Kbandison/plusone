import { NextResponse } from "next/server";

import { getServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Saves the order the member dragged their photos into.
 *
 * A ROUTE HANDLER, not a Server Action, and that is the whole point of it.
 *
 * A Server Action is part of the router: its response can carry a re-rendered
 * RSC payload for the current route, and the client cache is invalidated by
 * `cookies.set` as well as by revalidation — which every call makes possible,
 * because reading the session through supabase-ssr writes the auth cookies back
 * whenever it refreshes them. Dropping revalidatePath stopped the images being
 * re-signed, and the page still reloaded on every drop.
 *
 * Nothing about persisting an arrangement needs the router. The browser is
 * already showing the result; this is a write and an acknowledgement. A route
 * handler returns JSON and touches nothing else.
 *
 * The wall is still reorder_photos, which is SECURITY DEFINER and refuses any
 * set that is not exactly the caller's own. This runs as the member, so RLS
 * applies to the read as well.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false }, { status: 401 });

  let ids: unknown;
  try {
    ({ ids } = (await request.json()) as { ids?: unknown });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length === 0)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Checked here as well as in the RPC. The RPC is the wall; this is so a
  // browser working from a stale list writes nothing at all rather than an
  // order built from photos that no longer exist.
  const { data: rows } = await supabase
    .from("profile_photos")
    .select("id")
    .eq("user_id", auth.user.id);

  const mine = new Set((rows ?? []).map((row) => row.id as string));
  if (mine.size !== ids.length || (ids as string[]).some((id) => !mine.has(id))) {
    // Not an error the member caused, and not one they can act on: the next
    // render settles it.
    return NextResponse.json({ ok: false, stale: true }, { status: 409 });
  }

  const { error } = await supabase.rpc("reorder_photos", { p_ids: ids as string[] });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  return NextResponse.json({ ok: true });
}
