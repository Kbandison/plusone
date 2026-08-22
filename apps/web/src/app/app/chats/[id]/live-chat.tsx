"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabase } from "@plusone/db";
import { parseClientEnv } from "@plusone/config";

/**
 * The other person's message, arriving.
 *
 * A doorbell, not a delivery. It watches the chat's own row — which ring_chat()
 * touches whenever a message lands — and does one thing with the event: ask
 * Next to re-render. That re-render is a normal server render with the member's
 * own session, so may_read_chat, the block wall and every column grant apply
 * exactly as they do on a cold load. Nothing about who may see what is decided
 * here, which is the entire point of doing it this way.
 *
 * The event's payload is ignored completely. It is a chats row, not a message,
 * and even that is only read as "something happened".
 *
 * router.refresh() rather than mutating a client list: the thread, the fuse
 * countdown, the plan card and the closed-chat state are all server rendered
 * from the same query, and a client-side append would leave four of those five
 * stale while the messages looked fresh.
 *
 * It also keeps what the member is holding. refresh() re-renders Server
 * Components without remounting Client ones, so a half-typed reply, an attached
 * photograph and the scroll position all survive — which a reload would not.
 */
export function LiveChat({ chatId }: { chatId: string }) {
  const router = useRouter();

  useEffect(() => {
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
     * Two messages a second apart should be one refetch, not two — and somebody
     * sending three lines in a row is the ordinary case, not the edge one. A
     * The delay also covers the gap between the event and the read. Postgres
     * Changes streams from the WAL after commit, but the refetch is a separate
     * round trip and a pooled connection can answer from a fraction behind.
     */
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 120);
    };

    void (async () => {
      /**
       * Realtime evaluates the chats RLS policy per subscriber, using the JWT
       * it was given — so without the access token it would be authorising
       * `anon`, who is a participant in nothing, and every event would be
       * silently withheld.
       */
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || cancelled) return;
      await supabase.realtime.setAuth(token);

      /**
       * The chat's own row, filtered to this one.
       *
       * Not `messages`: the words people said to each other have no reason to
       * travel a second time over a different channel. ring_chat() touches this
       * row when a message lands, so the update IS the notification and the
       * payload is a status, a fuse and a date plan — all of which this member
       * can already read on the page they are looking at.
       *
       * The filter is server-side. Without it every participant of every chat
       * would be woken by every other chat they are in, and refetch a page they
       * are not looking at.
       */
      channel = supabase
        .channel(`chat-${chatId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "chats", filter: `id=eq.${chatId}` },
          refresh,
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [chatId, router]);

  return null;
}
