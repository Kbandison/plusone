import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { getServerSupabase } from "@/lib/supabase";
import { PhoneForm } from "./phone-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function PhonePage() {
  // The entry cannot use requireStep — that guard redirects an anonymous
  // visitor here, and this is here.
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/onboarding");

  return (
    <StepShell step="phone" heading={DRAFT_COPY.phone.heading} intro={DRAFT_COPY.phone.intro}>
      <PhoneForm />
    </StepShell>
  );
}
