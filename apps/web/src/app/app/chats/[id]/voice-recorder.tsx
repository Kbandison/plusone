"use client";

import { useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { sendVoiceNote } from "./actions";

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

  function cleanup() {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
  }

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
          // and lose the recording.
          if (current + 1 >= MAX_SECONDS) mr.stop();
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

    const result = await sendVoiceNote({ error: null }, form);
    if (result.error) {
      setError(result.error);
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
    <div className="mt-4 flex flex-col gap-3">
      {state === "idle" ? (
        <button
          type="button"
          onClick={start}
          className="ease-brand self-start rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-accent"
        >
          {C.voiceRecordLabel}
        </button>
      ) : null}

      {state === "recording" ? (
        <div className="flex items-center gap-4">
          <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-critical" />
          <span className="text-[15px] tabular-nums" role="status" aria-live="polite">
            {C.voiceRecording(seconds)}
          </span>
          <button
            type="button"
            onClick={() => recorder.current?.stop()}
            className="ease-brand rounded-lg border border-line-2 px-4 py-2 text-[14.5px] transition-colors duration-200 hover:border-accent"
          >
            {C.voiceStopLabel}
          </button>
        </div>
      ) : null}

      {state === "review" || state === "sending" ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* Heard before it is sent. A voice note cannot be unsaid. */}
          {preview ? <audio src={preview} controls className="max-w-full" /> : null}
          <button
            type="button"
            onClick={send}
            disabled={state === "sending"}
            className="ease-brand rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
          >
            {C.voiceSendLabel}
          </button>
          <button
            type="button"
            onClick={discard}
            className="ease-brand text-[14.5px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
          >
            {C.voiceDiscardLabel}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[14px] text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}
