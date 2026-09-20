"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DRAFT_COPY, NOTIFY_NUDGE_STORAGE_KEY } from "@plusone/config";

import { useLocalFlags } from "./local-flags";
import { inNativeShell } from "@/lib/native-shell";
import { nativePushPermission } from "@/lib/native-push";

const C = DRAFT_COPY.app;

/**
 * "You can be told when something happens" — said once, to somebody who has
 * not decided yet.
 *
 * ── IT NEVER ASKS FOR THE PERMISSION ───────────────────────────────────────
 *
 * This is the whole design and the reason it is safe to put on the home screen.
 * `push-toggle.tsx` refuses to prompt on arrival because "dismissing it on iOS
 * or Firefox is permanent for the origin — there is no second ask", and a
 * dialogue that appears before somebody has looked at the app is the one they
 * dismiss by reflex. Spending the single chance that way leaves a member unable
 * to turn notifications on ever.
 *
 * So this is a link. The real button is on the notifications screen, next to
 * the privacy note about what a lock screen shows, where somebody presses it
 * having read that. Dismissing this card costs nothing and can be undone by
 * going to the same screen.
 *
 * ── reading the state is free; asking is not ───────────────────────────────
 *
 * `Notification.permission` and the native `checkPermissions` both report
 * without prompting. That is what lets this decide whether to appear at all:
 * somebody who has already turned them on is not told about them, and somebody
 * who has already refused is not nagged about a decision this card cannot undo.
 *
 * ── this is not §3.3 ───────────────────────────────────────────────────────
 *
 * §3.3 forbids the app manufacturing a reason to come back — `claim_nearby_join`
 * names "come back, there are new people" as the shape it bans. This says a
 * capability exists and what it covers, once, and every event is opt-in behind
 * it. The same line BACKLOG 18c draws: a member asking to be told is not the
 * app nudging a member.
 */
export function NotifyNudge() {
  const { flags, has, add } = useLocalFlags(NOTIFY_NUDGE_STORAGE_KEY);
  const [undecided, setUndecided] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // The native shell answers through the bridge; a browser answers from
      // Notification. Asked in that order because a WKWebView has both, and
      // only the bridge knows what iOS actually granted.
      if (inNativeShell()) {
        const state = await nativePushPermission();
        if (alive) setUndecided(state === "prompt" || state === "prompt-with-rationale");
        return;
      }
      // No Notification at all is Safari in a browser tab, among others. There
      // is nothing to turn on, so there is nothing to say.
      const supported =
        typeof window !== "undefined" &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window;
      if (alive) setUndecided(supported && Notification.permission === "default");
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Null on the server and until both answers are in. Rendering first and
  // hiding afterwards would flash a card at somebody who turned notifications
  // on weeks ago.
  if (flags === null || undecided !== true || has("seen")) return null;

  return (
    <aside className="mt-6 rounded-xl border border-line-2 bg-surface p-5">
      <h2 className="text-[0.931rem]">{C.notifyNudgeHeading}</h2>
      <p className="mt-2 text-[12.6px] leading-[1.65] text-ink-2">{C.notifyNudgeBody}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* Dismissed on the way through, so somebody who acts on it does not
            come back to a card about a thing they have now done. */}
        <Link
          href="/app/settings/notifications"
          onClick={() => add("seen")}
          className="ease-brand min-h-tap inline-flex items-center text-[12.6px] text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:decoration-accent"
        >
          {C.notifyNudgeLink}
        </Link>
        <button
          type="button"
          onClick={() => add("seen")}
          className="ease-brand min-h-tap inline-flex items-center text-[12.6px] text-ink-3 transition-colors duration-300 hover:text-ink"
        >
          {C.notifyNudgeDismiss}
        </button>
      </div>
    </aside>
  );
}
