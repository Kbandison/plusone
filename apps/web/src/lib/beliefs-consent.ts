import type { SupabaseClient } from "@supabase/supabase-js";

import { CONSENT_COPY_VERSION } from "@plusone/config";

/**
 * Recording the faith-and-politics consent, in one place because there are two
 * callers.
 *
 * `PreferencesForm` is shared: onboarding sets these answers and the profile
 * editor changes them, from the same component and the same parser. The
 * consent shipped wired into the onboarding action alone, which meant a member
 * editing their faith from the profile page saw the checkbox, ticked it,
 * watched `profiles_beliefs_consent` refuse the write, and was told it did not
 * save with no way through. The parser's own docblock had already said why that
 * happens — "two copies would be two sets of rules, and only one of them would
 * get the next fix" — and this is the same shape one file over.
 *
 * Called BEFORE the update it authorises. The other order has the trigger
 * reject the write and the tick never stored.
 *
 * Idempotent: (user_id, kind, copy_version) is unique, so a second save is a
 * no-op rather than a duplicate row. Nothing here decides whether the consent is
 * REQUIRED — the database does, on the value being written, whichever path the
 * write arrives on.
 */
export async function recordBeliefsConsent(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData,
): Promise<void> {
  if (formData.get("beliefsConsent") !== "on") return;

  await supabase
    .from("consents")
    .insert({ user_id: userId, kind: "beliefs", copy_version: CONSENT_COPY_VERSION.beliefs })
    .select()
    .maybeSingle();
}

/** Postgres's insufficient_privilege, which is what the trigger raises. */
export const BELIEFS_CONSENT_MISSING = "42501";
