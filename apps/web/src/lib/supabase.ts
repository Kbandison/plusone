import { cookies } from "next/headers";

import { createServerSupabase } from "@plusone/db";
import { parseClientEnv } from "@plusone/config";

/**
 * The server Supabase client, bound to this request's session.
 *
 * `@plusone/db` stays platform-agnostic — web, mobile and admin all consume it,
 * so it never imports `next/headers`. This is the Next-shaped adapter it asks
 * for, and it lives here rather than there for that reason.
 *
 * Every query made through this runs AS THE MEMBER, so the walls in
 * `visible_profiles` and the RLS policies still apply. Reach for the service
 * client only from cron, the Stripe webhook and the purge job.
 */
export async function getServerSupabase() {
  const env = parseClientEnv(process.env);
  const store = await cookies();

  return createServerSupabase(
    {
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    {
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (toSet) => {
        // Server Components cannot write cookies. Middleware refreshes the
        // session, so swallowing here is correct rather than lossy.
        try {
          for (const { name, value, options } of toSet) {
            store.set({ ...(options as object), name, value });
          }
        } catch {
          /* called from a Server Component — refresh happens in middleware */
        }
      },
    },
  );
}

/** The signed-in member's id, or null. Never throws on an absent session. */
export async function getMemberId(): Promise<string | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
