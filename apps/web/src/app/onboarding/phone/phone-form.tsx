"use client";

import { useActionState, useId, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { PHONE_INITIAL, sendCode, verifyCode, type PhoneState } from "./actions";

const C = DRAFT_COPY.phone;

function Field({
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
      <label htmlFor={id} className="text-[15px]">
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
        className="ease-brand w-full rounded-lg border border-line-2 bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent focus:outline-none sm:w-[300px]"
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[13.5px] text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[14.5px] text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Submit({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="ease-brand w-full rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995] disabled:opacity-55 sm:w-auto sm:min-w-[190px] sm:self-start"
    >
      {label}
    </button>
  );
}

export function PhoneForm() {
  const [sendState, send, sending] = useActionState(sendCode, PHONE_INITIAL);
  const [changingNumber, setChangingNumber] = useState(false);
  const phoneId = useId();

  if (sendState.sentTo && !changingNumber) {
    return <CodeForm sent={sendState} onChangeNumber={() => setChangingNumber(true)} />;
  }

  return (
    <form action={send} className="mt-10 flex flex-col gap-8">
      <Field
        id={phoneId}
        label={C.phoneLabel}
        hint={C.phoneHint}
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        placeholder="+1 555 123 4567"
        error={sendState.error}
      />
      <Submit label={C.sendLabel} pending={sending} />
    </form>
  );
}

function CodeForm({ sent, onChangeNumber }: { sent: PhoneState; onChangeNumber: () => void }) {
  const [state, verify, verifying] = useActionState(verifyCode, sent);
  const [resendState, resend, resending] = useActionState(sendCode, sent);
  const codeId = useId();

  return (
    <div className="mt-10">
      <h2 className="text-[clamp(1.4rem,4vw,1.7rem)]">{C.codeHeading}</h2>
      <p className="mt-4 text-[16px] leading-[1.7] text-ink-2">{C.codeIntro}</p>

      <form action={verify} className="mt-8 flex flex-col gap-8">
        <Field
          id={codeId}
          label={C.codeLabel}
          name="code"
          type="text"
          inputMode="numeric"
          // The browser fills this from the SMS, which is the difference between
          // a two-minute signup and a four-minute one.
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          error={state.error}
        />
        <Submit label={C.verifyLabel} pending={verifying} />
      </form>

      {/* Both of these had strings written and no controls behind them, which
          made this screen a dead end: an SMS that never arrives, or a number
          typed wrong by one digit, left a member with nothing to press. It is
          step one of onboarding, so there is nowhere to go back to either. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <form action={resend}>
          <input type="hidden" name="phone" value={sent.sentTo ?? ""} />
          <button
            type="submit"
            disabled={resending}
            className="ease-brand text-[14.5px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink disabled:opacity-55"
          >
            {C.resendLabel}
          </button>
        </form>

        <button
          type="button"
          onClick={onChangeNumber}
          className="ease-brand text-[14.5px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
        >
          {C.changeNumberLabel}
        </button>
      </div>

      {resendState.error ? (
        <p role="alert" className="mt-3 text-[14.5px] text-critical">
          {resendState.error}
        </p>
      ) : null}
    </div>
  );
}
