"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabase } from "@plusone/db";
import { parseClientEnv } from "@plusone/config";

/** One table to watch, and which rows of it. */
export interface Watch {
  readonly table: string;
  /**
   * A PostgREST filter, evaluated by Realtime before anything is sent.
   *
   * Omit it only when RLS alone is the right scope — the inbox watches every
   * chat because "participants read their chats" already means "mine". With a
   * filterable column, use it: without one, every member of every chat is woken
   * by every other chat they are in and refetches a page they are not looking
   * at.
   */
  readonly filter?: string | undefined;
}

/**
 * Something arrived; ask the page to look again.
 *
 * A doorbell, not a delivery. The event's payload is ignored completely — all
 * this does is call router.refresh(), which is an ordinary server render with
 * the member's own session. Every policy, every column grant and every
 * security-definer function apply exactly as they do on a cold load, because it
 * IS a cold load.
 *
 * That is the whole reason it works here. Every wall in this schema is three
 * layers deep, ten columns are unreadable by members on purpose, and the things
 * the app renders — the room feed's anonymity redaction, the drop, the visible
 * profile — are produced by FUNCTIONS rather than by rows. Realtime can honour
 * policies and column grants and cannot reproduce a function. So it is never
 * asked to: it carries nothing, and the page fetches what it always fetched.
 *
 * refresh() also keeps what the member is holding. It re-renders Server
 * Components without remounting Client ones, so a half-typed reply, an attached
 * photograph and the scroll position all survive — which a reload would not.
 */
export function LiveRefresh({ watch }: { watch: readonly Watch[] }) {
  const router = useRouter();
  // Serialised, so an inline array literal in a parent does not re-subscribe on
  // every render of that parent.
  const key = JSON.stringify(watch);

  useEffect(() => {
    const targets = JSON.parse(key) as Watch[];
    if (targets.length === 0) return;

    const env = parseClientEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
    const supabase = createBrowserSupabase({
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    /**
     * Coalesced, because a refresh is a server render.
     *
     * Somebody sending three lines in a row is the ordinary case, not the edge
     * one, and a busy room is several people at once. The delay also covers the
     * gap between the event and the read: Postgres Changes streams from the WAL
     * after commit, but the refetch is a separate round trip and a pooled
     * connection can answer from a fraction behind.
     */
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 120);
    };

    void (async () => {
      /**
       * Realtime evaluates RLS with the JWT it is given. Without the access
       * token it authorises `anon`, who is a participant in nothing and in no
       * community, and every event is silently withheld — which looks exactly
       * like a feature that does not work.
       */
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || cancelled) return;
      await supabase.realtime.setAuth(token);

      // One channel for all of them. A channel is a websocket subscription and
      // three of them to the same server is three heartbeats for one screen.
      let joining = supabase.channel(`live-${key}`);
      for (const target of targets) {
        joining = joining.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: target.table,
            ...(target.filter ? { filter: target.filter } : {}),
          },
          refresh,
        );
      }
      channel = joining.subscribe();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [key, router]);

  return null;
}
