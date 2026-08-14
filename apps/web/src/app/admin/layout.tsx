import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";

/**
 * The admin surface (§7.3).
 *
 * Not indexed, not cached, and gated twice: this layout turns a non-admin away
 * at the door, and every RPC underneath checks `is_admin()` itself and raises.
 * A layout guard alone would be a client-side wall by another name — it stops
 * the page rendering, not the data moving.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  description: null,
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/onboarding/phone");

  const { data: isAdmin } = await supabase.rpc("is_admin", { p_user_id: data.user.id });
  if (!isAdmin) redirect("/");

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-12">
      <p className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">Moderation</p>
      {children}
    </div>
  );
}
