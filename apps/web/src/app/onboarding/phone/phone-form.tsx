"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { Field, RESEND_COOLDOWN_SECONDS, Submit } from "@/app/auth-fields";
import { sendCode, verifyCode } from "./actions";
import { type PhoneState } from "./state";
import { PHONE_INITIAL } from "./state";

const C = DRAFT_COPY.phone;

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

      {/* The consent moment, at the consent moment.
       *
       * A2P campaign review generally wants to SEE this — a reachable page
       * showing what a member agrees to when they press the button that sends
       * the text. Putting it in the terms instead is the version that gets a
       * campaign rejected, and it is also the version nobody reads. */}
      <p className="text-[13.5px] leading-[1.6] text-ink-3">
        {C.smsConsent}{" "}
        <Link
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-line-2 underline-offset-4 hover:text-ink"
        >
          {C.smsConsentPrivacy}
        </Link>{" "}
        ·{" "}
        <Link
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-line-2 underline-offset-4 hover:text-ink"
        >
          {C.smsConsentTerms}
        </Link>
      </p>

      <Submit label={C.sendLabel} pending={sending} />
    </form>
  );
}

function CodeForm({ sent, onChangeNumber }: { sent: PhoneState; onChangeNumber: () => void }) {
  const [state, verify, verifying] = useActionState(verifyCode, sent);
  const [resendState, resend, resending] = useActionState(sendCode, sent);
  const codeId = useId();

  // Starts already counting: arriving on this screen means a code was just
  // sent, so the first resend should not be available instantly either.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

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
        <form
          action={(formData) => {
            setCooldown(RESEND_COOLDOWN_SECONDS);
            resend(formData);
          }}
        >
          <input type="hidden" name="phone" value={sent.sentTo ?? ""} />
          <button
            type="submit"
            disabled={resending || cooldown > 0}
            className="ease-brand text-[14.5px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink disabled:opacity-55"
          >
            {cooldown > 0 ? C.resendWait(cooldown) : C.resendLabel}
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
