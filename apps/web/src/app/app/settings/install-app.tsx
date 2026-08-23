"use client";

import { useEffect, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { inNativeShell } from "@/lib/native-shell";

const C = DRAFT_COPY.app;

/**
 * The event Chromium fires when a site meets the install criteria.
 *
 * Not in lib.dom — it is a Chromium extension to the spec that other engines
 * have not adopted — so it is described here rather than cast away at the call
 * site, where the shape would go unchecked.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type State = "unknown" | "ready" | "installed" | "ios" | "unavailable";

/**
 * Installing the app, from inside the app.
 *
 * Chrome's own path for this is a menu item three taps deep whose label changes
 * with whether the criteria are met — "Install app" when they are, "Add to
 * Home screen" when they are not, and the second makes a bookmark with a Chrome
 * badge that looks installed and is not. That difference decides whether a
 * notification says "⁺One" or "www.loveplusone.app", which on this app is not a
 * cosmetic difference.
 *
 * So the app asks. `beforeinstallprompt` fires only when every criterion is
 * met, which makes the button its own proof: if it is there, installing will
 * work, and if it is not, no amount of pressing would have helped.
 *
 * iOS has no equivalent event — Safari offers this from its share menu and
 * nowhere else — so that branch describes the gesture instead. There is nothing
 * better available, and pretending otherwise would be a button that does
 * nothing on the platform where installing matters most.
 */
export function InstallApp() {
  const [state, setState] = useState<State>("unknown");
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    /**
     * The shell is installed, and neither check below can tell.
     *
     * A WebView reports `display-mode: browser` and has no
     * `navigator.standalone` — that one is Safari's — so both say "not
     * installed", and the iOS branch underneath would then hand somebody
     * already inside the app the instructions for adding it to their home
     * screen. First, because every other answer here is wrong once it is true.
     */
    if (inNativeShell()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads display-mode and the user agent, neither of which exists during a server render
      setState("installed");
      return;
    }

    // Already running as an installed app: nothing to offer.
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (installed) {
      setState("installed");
      return;
    }

    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      setState("ios");
      return;
    }

    const onPrompt = (event: Event) => {
      // Chrome shows its own mini-infobar otherwise, at a moment we did not
      // choose and without the sentence above explaining why this matters.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setState("ready");
    };

    const onInstalled = () => {
      setPrompt(null);
      setState("installed");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    /**
     * The event may already have fired.
     *
     * It is dispatched on load, and this component mounts after hydration — so
     * on a fast connection the listener can be attached too late and the button
     * never appears on a device that could install perfectly well. A short
     * grace period, then the honest fallback: tell them where their browser
     * keeps it.
     */
    const settle = window.setTimeout(
      () => setState((current) => (current === "unknown" ? "unavailable" : current)),
      1500,
    );

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(settle);
    };
  }, []);

  if (state === "installed") return null;

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[0.972rem]">{C.installHeading}</h2>
      <p className="mt-3 max-w-[52ch] text-[12.2px] leading-[1.65] text-ink-2">{C.installBody}</p>

      <div className="mt-5">
        {state === "ready" && prompt ? (
          <button
            type="button"
            onClick={() => {
              void prompt.prompt();
              // Not awaited for a result we then act on: the outcome is
              // reported by `appinstalled` either way, and a member who
              // dismisses has told us nothing that should change the screen.
              setPrompt(null);
            }}
            className={buttonClass("secondary")}
          >
            {C.installLabel}
          </button>
        ) : state === "ios" ? (
          <p className="max-w-[52ch] text-[12.2px] leading-[1.6] text-ink-2">{C.installIos}</p>
        ) : state === "unavailable" ? (
          <p className="max-w-[52ch] text-[12.2px] leading-[1.6] text-ink-3">
            {C.installUnavailable}
          </p>
        ) : null}
      </div>
    </section>
  );
}
