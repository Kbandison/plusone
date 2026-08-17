"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { beginLiveness, finishLiveness, openAppeal } from "./actions";
import { LIVENESS_INITIAL, type LivenessState } from "./state";
import { buttonClass } from "@/app/ui";

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
  // Whichever phase spoke MOST RECENTLY.
  //
  // "finished, once it has ever settled" was wrong in the other direction: after
  // one failed check a later begin error — the provider down, the cap reached —
  // could never reach the screen, because finish had settled once and won
  // forever. A begin that has moved past idle since is the newer word.
  const state =
    finishing || (finished.phase !== "idle" && begun.phase === "idle") ? finished : begun;

  // Out of attempts is not a rejection. §2 Decision #21 puts a human in the loop
  // on a risk flag, and this is what that looks like from the member's side:
  // told plainly, asked to do nothing.
  //
  // Reads the server's flag rather than inferring one from `attemptsLeft === 0`.
  // Inferring it meant the initial state — which has asked the server nothing —
  // rendered this screen to every member before they pressed a thing.
  if (state.review) {
    return <ReviewScreen review={state.review} error={state.error} />;
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
          // Reset too. Without this, one camera error latched the gate shut for
          // the life of the page: the capture branch tests !cameraFailed, so
          // Try again re-ran begin and then refused to show the camera — and
          // the member had no way to reach it again short of a reload.
          setCameraFailed(false);
          begin(formData);
        }}
      >
        <button
          type="submit"
          disabled={beginning || finishing}
          className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[210px] sm:self-start")}
        >
          {beginning || finishing ? C.checkingLabel : state.error ? C.retryLabel : C.startLabel}
        </button>
      </form>

      {state.error && state.attemptsLeft > 0 ? (
        <p className="text-[14px] text-ink-3">{C.retriesLeft(state.attemptsLeft)}</p>
      ) : null}

      {/* No session_id field: finishLiveness reads the open session off the
          member's own row. It used to be posted from here, which meant one
          member could submit another's session id and claim their verdict. */}
      <form ref={finishRef} action={finish} className="hidden" />
    </div>
  );
}

/**
 * What a member sees once a human has them.
 *
 * Three screens, not one. "Somebody will look" is true only of a flagged member
 * who has not been ruled on; a rejected member needs to be told the review
 * finished and offered the appeal, and a member whose appeal is already open
 * needs to be told to wait rather than asked again.
 *
 * Out of attempts is not a rejection. §2 Decision #21 puts a human in the loop
 * on a risk flag, and this is what that looks like from the member's side.
 */
function ReviewScreen({
  review,
  error,
}: {
  review: NonNullable<LivenessState["review"]>;
  error: string | null;
}) {
  const [state, appeal, appealing] = useActionState(openAppeal, LIVENESS_INITIAL);

  const waiting = review.appealOpen || Boolean(state.review?.appealOpen);
  const heading = waiting
    ? C.appealPendingHeading
    : review.status === "rejected"
      ? C.rejectedHeading
      : C.flaggedHeading;
  const body = waiting
    ? C.appealPendingBody
    : review.status === "rejected"
      ? C.rejectedBody
      : C.flaggedBody;

  return (
    // role="status" and focusable. This replaces the whole form, including the
    // button the member just pressed — so without it they press Start, the
    // button vanishes, focus lands on <body>, and the news that a person is
    // now involved is never announced at all.
    <div
      role="status"
      tabIndex={-1}
      ref={(node) => node?.focus()}
      /* The one defensible use: this container is focused programmatically so a
         screen reader announces the review, and a ring on a focus the member did
         not move there themselves is noise. Every other instance of this class
         in the app was cancelling the keyboard focus ring globals.css defines. */
      className="mt-10 rounded-lg border border-line-2 bg-surface p-6 focus:outline-none"
    >
      <h2 className="text-h3">{heading}</h2>
      <p className="mt-4 text-[16px] leading-[1.7] text-ink-2">{body}</p>

      {review.status === "rejected" && !waiting ? (
        <form action={appeal} className="mt-6">
          <button type="submit" disabled={appealing} className={buttonClass("secondary")}>
            {C.appealLabel}
          </button>
        </form>
      ) : null}

      {(state.error ?? error) ? (
        <p role="alert" className="mt-4 text-[14.5px] text-critical">
          {state.error ?? error}
        </p>
      ) : null}
    </div>
  );
}
