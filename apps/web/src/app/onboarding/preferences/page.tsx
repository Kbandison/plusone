import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";
import { savePreferences } from "./actions";
import { PreferencesForm, type PreferencesDefaults } from "./preferences-form";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

export const metadata: Metadata = { title: "Who you would like to meet" };

/** The shape my_profile() returns for the columns this step owns. */
interface OwnPreferences {
  gender: string | null;
  seeking: string[] | null;
  age_min: number | null;
  age_max: number | null;
  smokes: string | null;
  drinks: string | null;
  kids: string | null;
  kids_plan: string | null;
}

export default async function PreferencesPage() {
  await requireStep("preferences");

  // Read back, so walking BACK into this step shows what was answered rather
  // than an empty form that quietly overwrites it on submit. Every other step
  // that can be revisited has the same obligation.
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("my_profile").maybeSingle<OwnPreferences>();

  const defaults: PreferencesDefaults = {
    gender: data?.gender ?? null,
    seeking: data?.seeking ?? [],
    ageMin: data?.age_min ?? null,
    ageMax: data?.age_max ?? null,
    smokes: data?.smokes ?? null,
    drinks: data?.drinks ?? null,
    kids: data?.kids ?? null,
    kidsPlan: data?.kids_plan ?? null,
  };

  return (
    <StepShell
      step="preferences"
      heading={DRAFT_COPY.preferences.heading}
      intro={DRAFT_COPY.preferences.intro}
    >
      <PreferencesForm defaults={defaults} action={savePreferences} />
    </StepShell>
  );
}
