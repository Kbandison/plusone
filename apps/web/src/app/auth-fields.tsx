"use client";

/**
 * The two form primitives the sign-in screens share.
 *
 * They started as local functions in `onboarding/phone/phone-form.tsx`, which
 * was fine while there was one way in. Copying them for `/sign-in` would have
 * meant two definitions of the same accessible field, and the accessibility fix
 * below is exactly the kind that gets made in one copy and not the other.
 */

import type React from "react";
import { buttonClass } from "@/app/ui";

export function Field({
  id,
  label,
  hint,
  error,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  /** Rendered here rather than as a sibling, so the input can point at it. */
  error?: string | null;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[12.2px]">
        {label}
      </label>
      <input
        id={id}
        // The error too. It was rendered as a sibling <p role="alert"> that no
        // input pointed at, so it was announced once and then unfindable — a
        // member tabbing back to the field that failed was told only the hint.
        aria-describedby={
          [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined
        }
        aria-invalid={error ? true : undefined}
        /* line-control, not line-2: WCAG 1.4.11 wants 3:1 for the boundary of a
           control, and line-2 is about 1.15:1 against its own fill — fine on a
           decorative card edge, invisible as the edge of a field. */
        className="ease-brand w-full rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent sm:w-[243px]"
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[11px] text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[11.7px] text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Submit({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[153.9px] sm:self-start")}
    >
      {label}
    </button>
  );
}

/** Seconds between resends. One SMS is one charge, and people do tap twice. */
export const RESEND_COOLDOWN_SECONDS = 45;
