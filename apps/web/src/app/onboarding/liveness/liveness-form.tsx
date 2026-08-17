"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { beginLiveness, finishLiveness } from "./actions";
import { LIVENESS_INITIAL } from "./state";

const C = DRAFT_COPY.liveness;

/**
 * Kept out of the main bundle, and out of the server render.
 *
 * The Amplify liveness runtime is large and touches getUserMedia on mount, so
 * it loads only once a member actually starts a check. `ssr: false` is legal
 * here specifically because this file is a Client Component.
 */
const LivenessCapture = dynamic(() => import("./liveness-capture").then((m) => m.LivenessCapture), {
  ssr: false,
});

export function LivenessForm() {
  const [begun, begin, beginning] = useActionState(beginLiveness, LIVENESS_INITIAL);
  const [finished, finish, finishing] = useActionState(finishLiveness, LIVENESS_INITIAL);
  const [cancelled, setCancelled] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);

  // The camera signals completion from a callback, not from a click, so the
  // result has to be posted programmatically.
  const finishRef = useRef<HTMLFormElement>(null);
  const [completedSession, setCompletedSession] = useState<string | null>(null);
  useEffect(() => {
    if (completedSession) finishRef.current?.requestSubmit();
  }, [completedSession]);

  // Whichever phase spoke last, asked rather than inferred.
  //
  // This used to read `finished.error !== null || finishing ? finished : begun`,
  // which is wrong in the one case that matters most: a member flagged for human
  // review comes back with `error: null`, so the result was thrown away and the
  // stale begin state rendered a retry button — for a step they can no longer
  // pass, which then answered "the check is unavailable, try again in a moment"
  // every time they pressed it.
  const state = finished.phase !== "idle" || finishing ? finished : begun;

  // Out of attempts is not a rejection. §2 Decision #21 puts a human in the loop
  // on a risk flag, and this is what that looks like from the member's side:
  // told plainly, asked to do nothing.
  //
  // Reads the server's flag rather than inferring one from `attemptsLeft === 0`.
  // Inferring it meant the initial state — which has asked the server nothing —
  // rendered this screen to every member before they pressed a thing.
  if (state.flagged) {
    return (
      // role="status" and focusable. This replaces the whole form, including
      // the button the member just pressed — so without it they press Start,
      // the button vanishes, focus lands on <body>, and the news that they have
      // been flagged for human review is never announced at all.
      <div
        role="status"
        tabIndex={-1}
        ref={(node) => node?.focus()}
        className="mt-10 rounded-lg border border-line-2 bg-surface p-6 focus:outline-none"
      >
        <h2 className="text-[clamp(1.3rem,3.5vw,1.55rem)]">{C.flaggedHeading}</h2>
        <p className="mt-4 text-[16px] leading-[1.7] text-ink-2">{C.flaggedBody}</p>
      </div>
    );
  }

  if (begun.session && !completedSession && !cancelled && !cameraFailed) {
    return (
      <LivenessCapture
        sessionId={begun.session.sessionId}
        region={begun.session.region}
        credentials={begun.session.credentials}
        onComplete={() => setCompletedSession(begun.session!.sessionId)}
        // A camera error is NOT a failed check, and must not be finished as one.
        //
        // It used to call the same handler, so a device with no webcam — or a
        // refused permission — streamed nothing, scored zero, and burned an
        // attempt. Two clicks flagged a member for human review for owning a
        // desktop. Nothing was analysed, so nothing is spent.
        onFailed={() => setCameraFailed(true)}
        onCancel={() => setCancelled(true)}
      />
    );
  }

  return (
    <div className="mt-10 flex flex-col gap-6">
      {cameraFailed ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {C.errors.camera}
        </p>
      ) : state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      {cancelled ? (
        <p role="status" className="text-[15px] text-ink-2">
          {C.cancelledBody}
        </p>
      ) : null}

      <form
        action={(formData) => {
          setCompletedSession(null);
          setCancelled(false);
          begin(formData);
        }}
      >
        <button
          type="submit"
          disabled={beginning || finishing}
          className="ease-brand w-full rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995] disabled:opacity-55 sm:w-auto sm:min-w-[210px] sm:self-start"
        >
          {beginning || finishing ? C.checkingLabel : state.error ? C.retryLabel : C.startLabel}
        </button>
      </form>

      {state.error && state.attemptsLeft > 0 ? (
        <p className="text-[14px] text-ink-3">{C.retriesLeft(state.attemptsLeft)}</p>
      ) : null}

      <form ref={finishRef} action={finish} className="hidden">
        <input type="hidden" name="session_id" value={completedSession ?? ""} />
      </form>
    </div>
  );
}
