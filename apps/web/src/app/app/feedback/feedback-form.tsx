"use client";

import { useActionState, useId, useState } from "react";

import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_CONTEXT_NOTE,
  FEEDBACK_FALLBACK_EMAIL,
  FEEDBACK_KINDS,
  type FeedbackKind,
} from "@plusone/config";

import { Submit } from "@/app/auth-fields";
import { Card } from "@/app/ui";
import { appVersion, currentSurface, routeShape } from "@/lib/feedback";
import { submitFeedback } from "./actions";
import { FEEDBACK_INITIAL } from "./state";

const SURFACE_LABELS: Record<string, string> = {
  browser: "a browser",
  twa: "the Android app",
  ios: "the iPhone app",
  android: "the Android app",
};

export function FeedbackForm({ from }: { from: string }) {
  const [state, submit, pending] = useActionState(submitFeedback, FEEDBACK_INITIAL);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const bodyId = useId();

  /**
   * The screen they were on when they tapped through, not this one.
   *
   * `usePathname()` here is always /app/feedback, so falling back to it would
   * fill the field with the one value that cannot possibly be where the bug
   * was — always populated and always wrong, which is worse than empty because
   * nobody would think to distrust it.
   *
   * So: the referring screen when we have it, and nothing when we do not.
   */
  const page = from ? routeShape(from) : "";
  const surface = currentSurface();
  const version = appVersion();

  if (state.sent) {
    return (
      <Card className="mt-8">
        <h2 className="text-h3">Sent</h2>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">
          Thank you — it is in front of us. You can see what happened to it below, and we will not
          email you about it unless we need to ask something.
        </p>
      </Card>
    );
  }

  const chosen = FEEDBACK_KINDS.find((k) => k.id === kind);

  return (
    <form action={submit} className="mt-8 flex flex-col gap-8">
      {/* Carried in the form rather than read on the server: the server has no
          way to know which shell a request came from — a TWA is real Chrome and
          sends nothing that distinguishes it — so this is the only place the
          answer exists. Validated again in the action. */}
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="appVersion" value={version} />

      <fieldset>
        <legend className="text-[13.8px]">What kind of thing is this?</legend>
        <div className="mt-4 flex flex-col gap-2">
          {FEEDBACK_KINDS.map((option) => (
            <label key={option.id} className="min-h-tap flex items-center gap-3 text-[12.6px]">
              <input
                type="radio"
                name="kind"
                value={option.id}
                checked={kind === option.id}
                onChange={() => setKind(option.id)}
                className="size-5 shrink-0 accent-accent"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={bodyId} className="text-[12.2px]">
          What happened?
        </label>
        {/* The prompt changes with the kind. "Describe your issue" reliably
            produces "it doesn't work"; asking for what you did, what happened
            and what you expected produces a report somebody can act on. */}
        <p className="text-[11px] leading-[1.6] text-ink-3">{chosen?.prompt}</p>
        <textarea
          id={bodyId}
          name="body"
          required
          rows={6}
          maxLength={FEEDBACK_BODY_MAX}
          className="ease-brand w-full rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent"
          aria-describedby={state.error ? `${bodyId}-error` : undefined}
          aria-invalid={state.error ? true : undefined}
        />
        {state.error ? (
          <p id={`${bodyId}-error`} role="alert" className="text-[11.7px] text-critical">
            {state.error}
          </p>
        ) : null}
      </div>

      {/* Shown, never captured silently. It is three facts about the software
          and none about them, and letting them read it is the only way to make
          that claim checkable from where they are standing. */}
      <div className="rounded-lg border border-line-2 bg-surface-2 p-4">
        <p className="text-[11px] leading-[1.6] text-ink-3">{FEEDBACK_CONTEXT_NOTE}</p>
        <dl className="mt-3 flex flex-col gap-1 text-[11px] text-ink-3">
          <div className="flex gap-2">
            <dt className="text-ink-2">Screen</dt>
            <dd>{page || "not recorded"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-2">Running in</dt>
            <dd>{SURFACE_LABELS[surface] ?? surface}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-2">Version</dt>
            <dd>{version}</dd>
          </div>
        </dl>
      </div>

      <Submit label="Send" pending={pending} />

      {/* The report most worth having during a beta is "I cannot get in", and
          this form needs a session. Naming an address is the whole fix. */}
      <p className="text-[11px] leading-[1.6] text-ink-3">
        Cannot sign in, or would rather email? {FEEDBACK_FALLBACK_EMAIL}
      </p>
    </form>
  );
}
