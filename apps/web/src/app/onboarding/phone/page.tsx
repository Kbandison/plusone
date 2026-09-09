import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { onboarding } from "@plusone/logic";

import { STEP_ROUTES, loadFacts } from "@/lib/onboarding";
import { suggestedDialCode } from "@/lib/dial-code";
import { getServerSupabase } from "@/lib/supabase";
import { PhoneForm } from "./phone-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function PhonePage() {
  // The entry cannot use requireStep — that guard redirects an anonymous
  // visitor here, and this is here. So it guards itself, on the STEP rather
  // than on the session.
  //
  // Session-aware was a redirect loop: any authenticated user whose auth record
  // has no phone_confirmed_at resolves to "phone", so /onboarding sent them here
  // and this sent them straight back. Reachable through the dev sign-in, through
  // an email sign-in on an account that never confirmed a number, and through a
  // half-finished OTP — and it presents as a browser error page, not as anything
  // this app wrote.
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const step = onboarding.resolveStep(await loadFacts(data.user.id));
    if (step !== "phone") redirect(STEP_ROUTES[step]);
  }

  return (
    <StepShell step="phone" heading={DRAFT_COPY.phone.heading} intro={DRAFT_COPY.phone.intro}>
      {/* A suggestion, not an assumption — see lib/dial-code.ts. The field is a
          plain editable input and normalizePhone still refuses to invent a
          country code for anybody who clears it. */}
      <PhoneForm suggestedDialCode={await suggestedDialCode()} />
    </StepShell>
  );
}
