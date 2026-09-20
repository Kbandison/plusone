"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { DRAFT_COPY, NOTIFY_NUDGE_STORAGE_KEY } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { useLocalFlags } from "./local-flags";
import { inNativeShell } from "@/lib/native-shell";
import { nativePushPermission } from "@/lib/native-push";
import { enablePush, type EnablePushOutcome } from "@/lib/enable-push";

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
export function NotifyNudge({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const { flags, has, add } = useLocalFlags(NOTIFY_NUDGE_STORAGE_KEY);
  const [undecided, setUndecided] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<EnablePushOutcome | null>(null);
  const [pending, start] = useTransition();

  /**
   * It leaves on its own once it worked.
   *
   * Kevin asked for that rather than a card that sits there having been dealt
   * with. Four seconds is long enough to read three words and short enough not
   * to be furniture — and `add("seen")` runs in the same timer, so it does not
   * come back on the next render either.
   *
   * Only on success. A blocked or failed card stays, because it is telling
   * somebody something they still have to act on.
   */
  useEffect(() => {
    if (outcome !== "on") return;
    const timer = setTimeout(() => add("seen"), 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- add() is recreated every render; depending on it would restart the timer on each one and the card would never leave.
  }, [outcome]);

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

      {/* The privacy note, BEFORE the button rather than on the next screen.
          push-toggle's rule was never just "behind a button" — it is "behind a
          button, with the privacy note visible before they press". Switching
          here instead of sending somebody to Settings means bringing the note
          with it, or the press is less informed than it used to be. */}
      <p className="mt-3 text-[11px] leading-[1.6] text-ink-3">{C.pushPrivacyNote}</p>

      {outcome === "on" ? (
        <p role="status" className="mt-4 text-[12.6px] text-positive">
          {C.notifyNudgeDone}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* The real prompt, from a press. This is the one moment the app may
              ask — see lib/enable-push.ts. */}
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => setOutcome(await enablePush(vapidPublicKey)))}
            className={buttonClass("secondary")}
          >
            {C.notifyNudgeAction}
          </button>
          <button
            type="button"
            onClick={() => add("seen")}
            className="ease-brand min-h-tap inline-flex items-center text-[12.6px] text-ink-3 transition-colors duration-300 hover:text-ink"
          >
            {C.notifyNudgeDismiss}
          </button>
        </div>
      )}

      {/* Blocked cannot be undone from here — on iOS and Firefox that refusal
          is permanent for the origin — so this says where the way back is
          rather than offering a button that would do nothing. "off" is a
          dismissed dialogue and gets no message: they can simply press again. */}
      {outcome && outcome !== "on" && outcome !== "off" ? (
        <p role="alert" className="mt-3 text-[11.7px] leading-[1.6] text-ink-2">
          {outcome === "blocked" ? C.notifyNudgeBlocked : C.pushFailed}{" "}
          <Link
            href="/app/settings/notifications"
            onClick={() => add("seen")}
            className="ease-brand text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:decoration-accent"
          >
            {C.notifyNudgeSettings}
          </Link>
        </p>
      ) : null}
    </aside>
  );
}
