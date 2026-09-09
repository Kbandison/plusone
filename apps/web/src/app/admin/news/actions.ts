"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";
import { NEWS_INITIAL, type NewsState } from "./state";

/**
 * Editing an item.
 *
 * Everything is checked in admin_update_article: this only carries the form
 * across. is_admin() lives there because the wall belongs where the write is,
 * not where the button is.
 */
export async function updateNewsItem(_prev: NewsState, formData: FormData): Promise<NewsState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase.rpc("admin_update_article", {
    p_id: String(formData.get("id") ?? ""),
    p_title: String(formData.get("title") ?? ""),
    p_summary: String(formData.get("summary") ?? ""),
  });

  if (error) return { error: "That didn't save.", message: null };

  revalidatePath("/admin/news");
  return { ...NEWS_INITIAL, message: "Saved." };
}

/**
 * Removing one.
 *
 * A real delete: the ingest deduplicates on (room, url), so a soft-deleted row
 * would keep the article out forever and a removed one lets a corrected version
 * back in. Its comments go with it, which is right — a thread about an article
 * that is no longer there is a conversation with nothing at the top of it.
 */
export async function deleteNewsItem(_prev: NewsState, formData: FormData): Promise<NewsState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const { error } = await supabase.rpc("admin_delete_article", {
    p_id: String(formData.get("id") ?? ""),
  });

  if (error) return { error: "That didn't delete.", message: null };

  revalidatePath("/admin/news");
  return { ...NEWS_INITIAL, message: "Deleted." };
}

/**
 * Posting an article by hand.
 *
 * Not the gate. `admin_post_article` is SECURITY DEFINER and checks
 * `is_admin()` itself, refuses a non-https link, and refuses any room that is
 * not a Latest news room — an admin could otherwise put an authorless post into
 * a discussion room, where it would read as a member who deleted themselves.
 * Deleting every check from this file would change only the error copy.
 *
 * The count comes back so the message can tell "posted to both" from "the feed
 * already had it", which are different outcomes that used to look identical.
 */
export async function postArticle(_prev: NewsState, formData: FormData): Promise<NewsState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const roomIds = formData.getAll("roomId").map(String).filter(Boolean);
  if (roomIds.length === 0) {
    return { error: "Choose at least one room.", message: null };
  }

  const { data, error } = await supabase.rpc("admin_post_article", {
    p_room_ids: roomIds,
    p_url: String(formData.get("url") ?? ""),
    p_title: String(formData.get("title") ?? ""),
    p_source: String(formData.get("source") ?? ""),
    p_summary: String(formData.get("summary") ?? ""),
  });

  if (error) {
    // 22023 is the function's own validation — an https link, a headline, a
    // source, a Latest news room — and those messages are written for a person.
    // Anything else is ours.
    return {
      error: error.code === "22023" ? error.message : "That didn't post.",
      message: null,
    };
  }

  const added = typeof data === "number" ? data : 0;
  revalidatePath("/admin/news");
  return {
    ...NEWS_INITIAL,
    message:
      added === 0
        ? "Already posted — nothing added."
        : `Posted to ${added} room${added === 1 ? "" : "s"}.`,
  };
}
