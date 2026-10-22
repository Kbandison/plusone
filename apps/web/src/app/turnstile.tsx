"use client";

/**
 * Cloudflare Turnstile, on every form that sends a code.
 *
 * ── why ──────────────────────────────────────────────────────────────────────
 *
 * Every code is a paid SMS, and from 2026-10-20 a bot sent 134 of them to
 * Belarus through the signup form until the Twilio balance ran out. The
 * country check in the actions stops that destination; this stops the bot.
 * Supabase checks the token, not us — which matters, because the publishable
 * key is public and a bot locked out of our form could call /auth/v1/otp
 * directly. With Supabase's CAPTCHA on, that call is refused too.
 *
 * ── what a member sees ───────────────────────────────────────────────────────
 *
 * Usually nothing. `interaction-only` keeps the widget invisible unless
 * Cloudflare wants a click, and then it appears where it is rendered. Typing a
 * phone number takes longer than the check does, and the resend button waits
 * out a cooldown, so the token is normally there before anybody presses.
 *
 * ── the shells ───────────────────────────────────────────────────────────────
 *
 * The widget is an iframe on challenges.cloudflare.com. In the iOS shell that
 * host is NOT in `allowNavigation`, and it does not need to be: Capacitor only
 * sends TOP-LEVEL navigations off-list to Safari, and lets subframes through
 * (WebViewDelegationHandler, read upstream 2026-10-22). The TWA is real Chrome.
 * Neither has been looked at yet — see the commit.
 *
 * Renders nothing when there is no site key, so local work and any deploy
 * before the key exists behave exactly as they did.
 */

import { useEffect, useRef } from "react";

import { CAPTCHA_FIELD } from "@/lib/captcha";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** One script for the whole page, however many widgets ask for it. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing"));
    script.onerror = () => {
      // Forgotten so the next widget tries again, rather than every later
      // mount inheriting one bad moment on a train.
      loading = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function Turnstile({
  siteKey,
  resetKey,
}: {
  siteKey: string | null;
  /**
   * Changes whenever the form's action settles. A token is single-use, so the
   * one just sent is spent whatever the answer was, and a retry with it would
   * fail as `captcha_failed`.
   */
  resetKey?: unknown;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!siteKey || !element) return;
    let cancelled = false;

    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widget.current = api.render(element, {
          sitekey: siteKey,
          appearance: "interaction-only",
          "response-field-name": CAPTCHA_FIELD,
          theme: "auto",
          size: "flexible",
        });
      })
      // Swallowed on purpose. The form still submits with no token and the
      // action answers captchaFailed, which tells the member what to do.
      .catch(() => {});

    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={container} />;
}
