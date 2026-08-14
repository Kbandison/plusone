"use client";

import { useActionState, useId } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { PHONE_INITIAL, sendCode, verifyCode, type PhoneState } from "./actions";

const C = DRAFT_COPY.phone;

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[15px]">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? hintId : undefined}
        className="ease-brand w-full rounded-lg border border-line-2 bg-surface px-4 py-3 text-[16px] transition-colors duration-200 focus:border-accent focus:outline-none sm:w-[300px]"
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[13.5px] text-ink-3">
          {hint}
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
  const phoneId = useId();

  if (sendState.sentTo) {
    return <CodeForm sent={sendState} />;
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
      />
      {sendState.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {sendState.error}
        </p>
      ) : null}
      <Submit label={C.sendLabel} pending={sending} />
    </form>
  );
}

function CodeForm({ sent }: { sent: PhoneState }) {
  const [state, verify, verifying] = useActionState(verifyCode, sent);
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
        />
        {state.error ? (
          <p role="alert" className="text-[14.5px] text-critical">
            {state.error}
          </p>
        ) : null}
        <Submit label={C.verifyLabel} pending={verifying} />
      </form>
    </div>
  );
}
