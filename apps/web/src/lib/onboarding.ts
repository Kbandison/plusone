import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CONSENT_COPY_VERSION, QUIZ_QUESTIONS } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { getServerSupabase } from "./supabase";

type Step = onboarding.OnboardingStep;

/**
 * Where each §7.2 step lives. Exhaustive by type: adding a step to the machine
 * without giving it a route stops compiling, rather than routing someone to a
 * 404 halfway through signing up.
 */
export const STEP_ROUTES: Record<Step, string> = {
  phone: "/onboarding/phone",
  liveness: "/onboarding/liveness",
  profile_basics: "/onboarding/basics",
  community_condition: "/onboarding/community",
  health_consent: "/onboarding/consent",
  intention: "/onboarding/intention",
  quiz: "/onboarding/quiz",
  photos: "/onboarding/photos",
  radius: "/onboarding/radius",
  done: "/app",
};

/**
 * Reads the member's progress from the database.
 *
 * The mapping from row to booleans lives here rather than in `packages/logic`,
 * which stays free of database shapes. Everything is read as the member, so RLS
 * — and, for the profile row, my_profile()'s own auth.uid() — is what makes
 * this their own row and not someone else's.
 */
/** The columns of your own row that decide where onboarding resumes. */
interface OwnProfile {
  readonly display_name: string | null;
  readonly birthdate: string | null;
  readonly community: string | null;
  readonly condition: string | null;
  readonly intention: string | null;
  readonly search_radius_mi: number | null;
  readonly liveness_passed_at: string | null;
}

export async function loadFacts(userId: string): Promise<onboarding.OnboardingFacts> {
  const supabase = await getServerSupabase();

  const [{ data: user }, { data: profile }, { data: consent }, { data: photos }, { data: quiz }] =
    await Promise.all([
      supabase.auth.getUser(),
      // my_profile() rather than the table: birthdate is no longer in the
      // members' column grant (20260815000800), because a table-wide grant was
      // handing every member in your pool an exact date of birth. This is the
      // one row you are allowed all of — your own.
      supabase.rpc("my_profile").maybeSingle<OwnProfile>(),
      supabase
        .from("consents")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "health_data")
        // Tied to the wording, not just the kind: when the copy changes, the old
        // tick stops counting and the resolver sends them back to consent.
        .eq("copy_version", CONSENT_COPY_VERSION.health_data)
        .maybeSingle(),
      supabase.from("profile_photos").select("id").eq("user_id", userId).limit(1),
      supabase.from("quiz_responses").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);

  return {
    phoneVerified: Boolean(user.user?.phone_confirmed_at),
    // Its own column, not a reading of verification_status. Liveness runs at
    // step 2 and onboarding finishes at step 9 — one flag cannot mean both.
    livenessPassed: Boolean(profile?.liveness_passed_at),
    hasBasics: Boolean(profile?.display_name && profile.birthdate),
    hasCommunity: Boolean(profile?.community && profile.condition),
    hasHealthConsent: Boolean(consent),
    hasIntention: Boolean(profile?.intention),
    // The step turns itself on with the questions. A skip writes an EMPTY row
    // rather than no row, so presence is the right thing to read: no row means
    // unanswered, and a member who skipped would otherwise meet the screen
    // forever.
    quizSettled: QUIZ_QUESTIONS.length === 0 || Boolean(quiz),
    hasPhoto: Boolean(photos && photos.length > 0),
    radiusSet: Boolean(profile?.search_radius_mi),
  };
}

/**
 * Attributes an invite, once, as soon as the member has an account.
 *
 * Not at the landing page: there is nobody to attribute it to yet. Not at
 * verification either — §6.5 counts the conversion then, but the attribution
 * has to already exist for the trigger to find. A bad or missing code is
 * silently ignored, because a member who followed a link is not responsible for
 * whether it resolved.
 */
async function attributeInviteOnce(): Promise<void> {
  const store = await cookies();
  const code = store.get("plusone_ref")?.value;
  if (!code) return;

  const supabase = await getServerSupabase();
  await supabase.rpc("attribute_referral", { p_code: code });

  try {
    store.delete("plusone_ref");
  } catch {
    // Server Components cannot write cookies. The RPC is idempotent on
    // invitee_id, so a cookie that outlives its use costs nothing.
  }
}

/**
 * The guard every onboarding screen calls first.
 *
 * Typing a URL cannot skip a step. Without this, `/onboarding/intention` is
 * reachable by anyone who guesses it — which would walk straight past the §9.1
 * consent screen, and a consent you can navigate around is not a consent.
 *
 * Redirects to whichever step the member actually belongs on, which is also
 * what makes the flow resumable.
 */
export async function requireStep(step: Step): Promise<{ userId: string }> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect(STEP_ROUTES.phone);

  await attributeInviteOnce();

  const facts = await loadFacts(data.user.id);
  const actual = onboarding.resolveStep(facts);

  if (actual !== step) redirect(STEP_ROUTES[actual]);

  return { userId: data.user.id };
}
