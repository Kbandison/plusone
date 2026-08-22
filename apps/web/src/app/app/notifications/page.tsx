import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { DRAFT_COPY, NOTIFICATIONS, NOTIFICATION_LINES } from "@plusone/config";
import type { NotificationEvent } from "@plusone/config";
import { chat as chatLogic } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import { EmptyState } from "@/app/ui";

const C = DRAFT_COPY.app;

export const metadata: Metadata = { title: C.notificationsHeading };

interface Row {
  id: string;
  event: string;
  actor_name: string | null;
  subject_id: string | null;
  subject_path: string | null;
  created_at: string;
  read_at: string | null;
}

/**
 * Somewhere to read them.
 *
 * §8 built a matrix of pushes and nothing a member could look at. A push is a
 * MOMENT — dismiss it, or have the phone face down, and the thing that
 * happened is gone — and everything in this app that matters arrived exactly
 * once: a connect, a reply, a plan, a fuse about to run out.
 *
 * Nothing here is stored as a sentence. Every row is an event and two
 * references, and the line is composed at render time from whatever the READER
 * is allowed to see. So a name they may no longer see (a block, a deletion, an
 * anonymous post) is simply absent, and a link into a post since deleted is
 * simply not a link — rather than either being a frozen copy of a world that
 * has moved. Same argument as room_feed().
 */
export default async function NotificationsPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const [{ data }, { data: profile }] = await Promise.all([
    supabase.rpc("my_notifications", { p_limit: 50 }),
    supabase.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle(),
  ]);

  const rows = (data ?? []) as Row[];
  const zone = (profile?.timezone as string | null) ?? "UTC";
  const now = Date.now();

  /**
   * Opening the list is what makes it read, and it happens AFTER the response.
   *
   * after(), not `void`: a PostgrestBuilder is a thenable, so `void
   * supabase.rpc(...)` builds the call and throws it away without ever sending
   * it — which is how four read markers in this app sat at nought forever. The
   * chat and the rooms mark themselves the same way.
   *
   * After rather than before, so this render still shows which ones were new.
   * The member sees what arrived while they were away, and the bell is clear by
   * the time they navigate — no extra tap, and nothing changes under their eyes
   * while they are reading it. The layout's watch is INSERT-only for the same
   * reason: this UPDATE must not ring its own doorbell.
   */
  if (rows.some((row) => row.read_at === null)) {
    after(async () => {
      await supabase.rpc("mark_notifications_read");
    });
  }

  return (
    <main id="main">
      <h1 className="text-h2">{C.notificationsHeading}</h1>

      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState heading={C.notificationsHeading} body={C.notificationsEmpty} />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col">
          {rows.map((row) => {
            const event = row.event as NotificationEvent;
            const line = NOTIFICATION_LINES[event];
            // An event this build does not know about. Possible for one render
            // after a deploy that removes one, and a crash on the notification
            // screen is a poor way to find out.
            if (!line) return null;

            /**
             * The resolved path when there is one, the event's page otherwise.
             *
             * my_notifications resolves the exact destination — this post, this
             * chat — through the member's own permissions, so a post since
             * deleted comes back null. NOTIFICATIONS[event].path is the
             * page-level fallback, which is also the only thing a push may
             * carry: a URL on a lock screen must not identify anything.
             */
            const href = row.subject_path ?? NOTIFICATIONS[event].path;
            const unread = row.read_at === null;
            const at = Date.parse(row.created_at);

            return (
              <li key={row.id}>
                <Link
                  href={href}
                  className={`ease-brand -mx-3 flex min-h-tap items-center gap-3 rounded-lg px-3 py-3.5 transition-colors duration-200 hover:bg-surface ${
                    unread ? "" : "text-ink-2"
                  }`}
                >
                  {/* The dot carries no meaning on its own — it is a coloured
                      circle to anyone not looking, and invisible to anyone
                      listening. aria-hidden here, and the state is said in
                      words below. */}
                  <span
                    aria-hidden="true"
                    className={`size-1.5 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-transparent"}`}
                  />
                  <span className="min-w-0 flex-1 text-[12.6px] leading-[1.55]">
                    {line(row.actor_name)}
                    {unread ? (
                      <span className="sr-only"> — {C.notificationsUnreadDivider}</span>
                    ) : null}
                  </span>
                  <time
                    dateTime={row.created_at}
                    title={chatLogic.messageTimeExact(at, zone)}
                    className="shrink-0 text-[11.3px] text-ink-3 tabular-nums"
                  >
                    {chatLogic.compactAge(at, now, zone)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
