import { NextResponse } from "next/server";

import { getServerSupabase } from "@/lib/supabase";

/**
 * Sending a connect from a drop card.
 *
 * Every rule lives in `create_connect` and in the trigger behind it: the
 * community and mode walls, the daily budget, the support-only restriction.
 * They run whatever path the insert arrives by, which is why this handler
 * checks nothing itself — a check here would be a second, weaker statement of a
 * rule already enforced where it cannot be bypassed.
 *
 * A drop-card connect costs nothing (§6.3), which the source tells the RPC.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const targetId = String(form.get("target_id") ?? "");

  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/onboarding/phone", request.url), 303);

  const { error } = await supabase.rpc("create_connect", {
    p_target_id: targetId,
    p_prompt_id: null,
    p_prompt_reply: null,
    p_source: "drop",
    p_room_id: null,
  });

  const url = new URL("/app", request.url);
  url.searchParams.set("connect", error ? "failed" : "sent");
  return NextResponse.redirect(url, 303);
}
