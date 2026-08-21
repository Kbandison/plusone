"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRAFT_COPY, MAX_DISPLAY_NAME } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { NAME_INITIAL, type NameState } from "./name-state";

const E = DRAFT_COPY.basics.errors;

/**
 * Changing the name every other member sees.
 *
 * The same two rules the onboarding step applies, because it is the same
 * column with the same constraint behind it — a name that was refused on the
 * way in should not be accepted on the way back.
 */
export async function saveDisplayName(_prev: NameState, formData: FormData): Promise<NameState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) return { error: E.nameRequired, message: null };
  if (displayName.length > MAX_DISPLAY_NAME) return { error: E.nameTooLong, message: null };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", auth.user.id);

  if (error) return { error: "That didn't save.", message: null };

  // Every surface that shows a name, not just this one.
  for (const path of ["/app", "/app/profile", "/app/inbox", "/app/rooms"]) revalidatePath(path);
  return { ...NAME_INITIAL, message: DRAFT_COPY.app.profileNameSaved };
}
