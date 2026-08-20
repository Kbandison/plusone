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
