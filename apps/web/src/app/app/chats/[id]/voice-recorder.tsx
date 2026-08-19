"use client";

import { useEffect, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { sendVoiceNote } from "./actions";
import { buttonClass, iconButtonClass } from "@/app/ui";
import { MicIcon } from "./chat-icons";

const C = DRAFT_COPY.app;
const MAX_SECONDS = 120;

/**
 * Recording a voice note (§10, never-cut list).
 *
 * Deliberately plain: a record button, a running count, and a chance to hear it
 * before it goes. No waveform, no filters, no effects — the point of this
 * feature is that it is unmistakably a real person, and production polish works
 * against that.
 *
 * The recording stops itself at the two-minute cap rather than letting someone
 * talk past it and lose the lot.
 */
export function VoiceRecorder({ chatId }: { chatId: string }) {
  const [state, setState] = useState<"idle" | "recording" | "review" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  // The microphone must not outlive the component.
  //
  // cleanup() only ran from onstop and from the catch, so navigating away
  // mid-recording left the interval ticking AND the getUserMedia stream open —
  // a live mic and a recording indicator on a member's phone, after they had
  // left the page. In a product for this community that is not a tidiness
  // problem. The ref means this runs on unmount without re-running on state.
  const cleanupRef = useRef<() => void>(() => {});
  useEffect(() => () => cleanupRef.current(), []);

  function cleanup() {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
  }
  cleanupRef.current = cleanup;

  async function start() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(C.voiceUnsupported);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];

      mr.ondataavailable = (event) => chunks.current.push(event.data);
      mr.onstop = () => {
        blob.current = new Blob(chunks.current, { type: mr.mimeType });
        setPreview(URL.createObjectURL(blob.current));
        setState("review");
        cleanup();
      };

      recorder.current = mr;
      mr.start();
      setSeconds(0);
      setState("recording");

      ticker.current = setInterval(() => {
        setSeconds((current) => {
          // Stops itself at the cap rather than letting someone talk past it
          // and lose the recording — and says so, because a recorder that
          // stops on its own with no explanation reads as a crash.
          if (current + 1 >= MAX_SECONDS) {
            mr.stop();
            setError(C.voiceTooLong);
          }
          return current + 1;
        });
      }, 1000);
    } catch {
      setError(C.voiceUnsupported);
      cleanup();
    }
  }

  async function send() {
    if (!blob.current) return;
    setState("sending");

    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("seconds", String(Math.max(1, seconds)));
    form.set("audio", new File([blob.current], "note", { type: blob.current.type }));

    // Unguarded, this awaited a server action that can reject — a dropped
    // connection left state pinned at "sending" with Send disabled and no error
    // shown, and only a reload got out of it. A loading state that never
    // resolves is worse than an error, because it looks like progress.
    try {
      const result = await sendVoiceNote({ error: null }, form);
      if (result.error) {
        setError(result.error);
        setState("review");
        return;
      }
    } catch {
      setError(C.voiceFailed);
      setState("review");
      return;
    }
    discard();
  }

  function discard() {
    if (preview) URL.revokeObjectURL(preview);
    blob.current = null;
    setPreview(null);
    setSeconds(0);
    setState("idle");
  }

  return (
    <div className="flex flex-col gap-3">
      {/* A persistent live region naming the current phase.
       *
       * Each phase renders a different button, so pressing Record unmounts the
       * element holding focus and React drops it to <body> — a keyboard or
       * screen-reader user pressed a button and then had no idea what had
       * happened or where they were. The comment below is right that the
       * SECONDS must not be announced, and the phase is a different thing: it
       * changes three times in a recording, not sixty. */}
      <p role="status" className="sr-only">
        {state === "recording"
          ? C.voiceRecordingStatus
          : state === "review"
            ? C.voiceReviewStatus
            : ""}
      </p>

      {state === "idle" ? (
        // An icon, with the label as its accessible name rather than beside it.
        // It sits next to the date control under the composer, and two worded
        // buttons there compete with Send for the same glance.
        <button
          type="button"
          onClick={start}
          aria-label={C.voiceRecordLabel}
          className={iconButtonClass("secondary")}
        >
          <MicIcon />
        </button>
      ) : null}

      {state === "recording" ? (
        <div className="flex items-center gap-4">
          <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-critical" />
          {/* No live region. This changes every second, and announcing the
              elapsed time once a second talks over everything else on the page.
              The state change into recording is what is worth announcing, and
              the button that replaces Record already says it. */}
          <span className="text-[12.2px] tabular-nums">{C.voiceRecording(seconds)}</span>
          <button
            type="button"
            onClick={() => recorder.current?.stop()}
            className={buttonClass("secondary")}
          >
            {C.voiceStopLabel}
          </button>
        </div>
      ) : null}

      {state === "review" || state === "sending" ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* Heard before it is sent. A voice note cannot be unsaid. */}
          {preview ? (
            <audio
              src={preview}
              controls
              aria-label={C.voiceNoteAria(seconds)}
              className="max-w-full"
            />
          ) : null}
          <button
            type="button"
            onClick={send}
            disabled={state === "sending"}
            className={buttonClass("primary")}
          >
            {C.voiceSendLabel}
          </button>
          <button
            type="button"
            onClick={discard}
            // Discarding mid-send nulls the blob, so if the send then failed the
            // member landed back on review with no audio and a Send button that
            // silently did nothing.
            disabled={state === "sending"}
            className="ease-brand text-[11.7px] text-ink-3 disabled:opacity-55 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
          >
            {C.voiceDiscardLabel}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[11.3px] text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}
