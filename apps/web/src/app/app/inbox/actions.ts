"use server";

import { revalidatePath } from "next/cache";

import { DEFAULT_CLOSURE_TEMPLATE_INDEX } from "@plusone/config";
import { tone } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { describeViolations } from "@/lib/tone-messages";
import { memberFacingError } from "@/lib/rpc-error";
import { notify } from "@/lib/notify";
import type { InboxState } from "./state";

export async function acceptConnect(_prev: InboxState, formData: FormData): Promise<InboxState> {
  const connectId = String(formData.get("connect_id") ?? "");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("accept_connect", { p_connect_id: connectId });
  if (error) return { error: memberFacingError(error, "That didn't work. Try again.") };

  /**
   * The person who sent it, who has been waiting.
   *
   * Read after the accept rather than before: the RPC is the wall, and a row
   * this member could not act on would have been refused there. `own connects
   * are readable` scopes the select to the two of them.
   *
   * A DECLINE is deliberately not notified. §3.5 makes a decline carry a note,
   * and that note is the message — it is waiting in the inbox and it is a thing
   * to read when they choose to, not a buzz saying somebody said no.
   */
  const { data: auth } = await supabase.auth.getUser();
  const { data: connect } = await supabase
    .from("connects")
    .select("initiator_id")
    .eq("id", connectId)
    .maybeSingle<{ initiator_id: string }>();

  if (auth.user && connect) {
    await notify("connect_accepted", [connect.initiator_id], {
      actorId: auth.user.id,
      subjectId: connectId,
    });
  }

  revalidatePath("/app/inbox");
  revalidatePath("/app/chats");
  return { error: null };
}

/**
 * A decline is never silence (Decision #14, §3.5) — it carries a template note,
 * so the RPC defaults to template 0 rather than allowing none.
 *
 * The optional personal line is tone-checked here before it is sent. That check
 * is about what one member is allowed to say to another, which is a product
 * rule rather than a data rule, so it belongs on this side. What it protects
 * against most is a parting shot about someone's status.
 */
export async function declineConnect(_prev: InboxState, formData: FormData): Promise<InboxState> {
  const line = String(formData.get("personal_line") ?? "").trim();

  if (line) {
    const result = tone.checkTone(line);
    if (!result.ok) {
      return { error: describeViolations(result.violations) };
    }
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("decline_connect", {
    p_connect_id: String(formData.get("connect_id") ?? ""),
    p_template: Number(formData.get("template") ?? DEFAULT_CLOSURE_TEMPLATE_INDEX),
    p_personal_line: line || null,
  });

  if (error) return { error: memberFacingError(error, "That didn't work. Try again.") };
  revalidatePath("/app/inbox");
  return { error: null };
}
