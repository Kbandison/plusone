"use server";

import { getServerSupabase } from "@/lib/supabase";

/**
 * Records where the member actually is.
 *
 * Not a redirect on failure and no error returned: this is reported from the
 * browser on load and there is nothing a member could do about it going wrong.
 * A refusal means the zone did not validate, which is a bug or a spoof, and
 * either way the stored value stays as it was.
 */
export async function reportTimezone(timezone: string): Promise<void> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const { error } = await supabase.rpc("set_my_timezone", { p_timezone: timezone });
  if (error) {
    console.error(JSON.stringify({ at: "timezone.report", problem: error.message }));
  }
}
