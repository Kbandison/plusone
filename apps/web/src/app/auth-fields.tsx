"use client";

/**
 * The form primitives the sign-in screens share.
 *
 * They started as local functions in `onboarding/phone/phone-form.tsx`, which
 * was fine while there was one way in. Copying them for `/sign-in` would have
 * meant two definitions of the same accessible field, and the accessibility fix
 * below is exactly the kind that gets made in one copy and not the other.
 *
 * `SelectField` and `CheckField` were added for /waitlist, which is a third
 * front-door form and the first one that is not only text inputs. Put here
 * rather than beside that page for the reason the first paragraph gives: the
 * 16px floor, the described-by wiring and the error placement are the same
 * problems whatever the control is, and a second copy is where one of them
 * gets fixed and the other does not.
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

/**
 * A select, wired the same way as Field.
 *
 * `text-[16px]` is a literal on the tag on purpose. iOS Safari zooms the
 * viewport when a focused control is under 16px, and design-system.test.ts
 * reads that literal out of the tag — a class hoisted into a constant has twice
 * taken controls out of that gate's sight without anybody noticing, so this one
 * stays where the scan can see it.
 */
export function SelectField({
  id,
  label,
  hint,
  error,
  placeholder,
  options,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  placeholder: string;
  options: readonly { readonly id: string; readonly label: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[12.2px]">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={
          [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined
        }
        aria-invalid={error ? true : undefined}
        className="ease-brand min-h-tap w-full rounded-lg border border-line-control bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent sm:w-[243px]"
        defaultValue=""
        {...props}
      >
        {/* Empty and disabled: a select whose first option is a real value is a
            select somebody submits without reading. */}
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
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

/**
 * A checkbox with its explanation.
 *
 * No text size on the input: a checkbox raises no keyboard and so cannot
 * trigger the iOS zoom the 16px floor exists to prevent. It carries the 44px
 * tap floor instead, which is the one that applies to it.
 */
export function CheckField({
  id,
  label,
  hint,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="checkbox"
          aria-describedby={hint ? hintId : undefined}
          className="size-5 shrink-0 accent-accent"
          {...props}
        />
        <label htmlFor={id} className="min-h-tap flex items-center text-[12.2px]">
          {label}
        </label>
      </div>
      {hint ? (
        <p id={hintId} className="text-[11px] leading-[1.6] text-ink-3">
          {hint}
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
