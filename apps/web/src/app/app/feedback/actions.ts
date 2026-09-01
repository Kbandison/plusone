"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { FEEDBACK_BODY_MAX } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import type { FeedbackState } from "./state";

const KINDS = ["bug", "idea", "other"] as const;
const SURFACES = ["browser", "twa", "ios", "android"] as const;

export async function submitFeedback(
  _previous: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const kind = String(formData.get("kind") ?? "");
  if (!KINDS.includes(kind as (typeof KINDS)[number])) {
    return { error: "Pick what kind of thing this is.", sent: false };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Tell us what happened.", sent: false };
  if (body.length > FEEDBACK_BODY_MAX) {
    return { error: `That is longer than ${FEEDBACK_BODY_MAX} characters.`, sent: false };
  }

  // Validated rather than passed through. These arrive from the client, and the
  // CHECK constraints would refuse a bad one with a 500 the member cannot act
  // on — better to drop a field we could not read than to fail their report
  // over context that is a nicety.
  const rawSurface = String(formData.get("surface") ?? "");
  const surface = SURFACES.includes(rawSurface as (typeof SURFACES)[number]) ? rawSurface : null;

  const rawPage = String(formData.get("page") ?? "");
  const page = /^\/[A-Za-z0-9/_.[\]-]*$/.test(rawPage) && rawPage.length <= 120 ? rawPage : null;

  const { error } = await supabase.rpc("submit_feedback", {
    p_kind: kind,
    p_body: body,
    p_surface: surface,
    p_page: page,
    p_app_version: String(formData.get("appVersion") ?? "").slice(0, 40) || null,
  });

  if (error) {
    // 54000 is the rate limit in submit_feedback. Everything else is ours.
    //
    // The body is NOT logged. It is member content — §9.6 — and a bug report on
    // this app can quote a message or name a person.
    if (error.code === "54000") {
      return { error: "That is a lot of reports in an hour. Try again shortly.", sent: false };
    }
    console.error(JSON.stringify({ at: "feedback.submit", problem: error.code ?? "unknown" }));
    return { error: "That did not send. Try again in a moment.", sent: false };
  }

  revalidatePath("/app/feedback");
  return { error: null, sent: true };
}
