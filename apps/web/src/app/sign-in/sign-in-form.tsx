"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { Field, RESEND_COOLDOWN_SECONDS, Submit } from "@/app/auth-fields";
import { applyDialCode } from "@/lib/dial-code-input";
import { sendSignInCode, verifySignInCode } from "./actions";
import { SIGN_IN_INITIAL, type SignInState } from "./state";

const C = DRAFT_COPY.signIn;

export function SignInForm({ suggestedDialCode = "" }: { suggestedDialCode?: string }) {
  const [sendState, send, sending] = useActionState(sendSignInCode, SIGN_IN_INITIAL);
  const [changing, setChanging] = useState(false);
  const identifierId = useId();
  // What the field held before this keystroke. applyDialCode only acts on the
  // transition from empty, and an uncontrolled input does not remember.
  const before = useRef("");

  if (sendState.sentTo && !changing) {
    return <CodeForm sent={sendState} onChange={() => setChanging(true)} />;
  }

  return (
    <form
      action={(formData) => {
        // Cleared on every send, or this is a one-way door: the flag was only
        // ever set to true, so tapping "use something else" removed the code
        // screen for good and a member who had the code in their hand had
        // nowhere to type it.
        setChanging(false);
        send(formData);
      }}
      className="mt-10 flex flex-col gap-8"
    >
      <Field
        id={identifierId}
        label={C.identifierLabel}
        hint={C.identifierHint}
        name="identifier"
        // Not type="tel" or type="email": the field takes either, and a keyboard
        // or a validator committed to one of them fights whichever the member
        // brought. The server decides which it is.
        type="text"
        inputMode="text"
        autoComplete="username"
        required
        // The country code /onboarding/phone prefills outright, offered here at
        // the first keystroke that proves this is a number and not an address.
        // See lib/dial-code-input.ts.
        onInput={(event) => {
          const input = event.currentTarget;
          const prefixed = applyDialCode(before.current, input.value, suggestedDialCode);
          if (prefixed !== null) {
            input.value = prefixed;
            // Without this the caret jumps to the front of the code the member
            // did not type, and the next digit lands in the middle of it.
            input.setSelectionRange(prefixed.length, prefixed.length);
          }
          before.current = input.value;
        }}
        error={sendState.error}
      />

      {/* This screen can still send an SMS, so the disclosure sits at the
          moment of sending. Shorter than onboarding's: a returning member
          opted in when they joined. */}
      <p className="text-[12.2px] leading-[1.6] text-ink-3">{C.smsConsent}</p>

      <Submit label={C.sendLabel} pending={sending} />

      <p className="text-[13px] text-ink-2">
        {C.newHere}{" "}
        <Link
          href="/onboarding/phone"
          className="underline decoration-line-2 underline-offset-4 hover:text-ink"
        >
          {C.newHereLink}
        </Link>
      </p>
    </form>
  );
}

function CodeForm({ sent, onChange }: { sent: SignInState; onChange: () => void }) {
  const [state, verify, verifying] = useActionState(verifySignInCode, sent);
  const [resendState, resend, resending] = useActionState(sendSignInCode, sent);
  const codeId = useId();

  // Starts already counting: arriving here means a code was just sent, so the
  // first resend should not be available instantly either.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  return (
    <div className="mt-10">
      <h2 className="text-h3">{C.codeHeading}</h2>
      {/* Deliberately does NOT name where the code went.
       *
       * Echoing the identifier back is the ordinary thing to do and it is the
       * one thing this screen must not do: reaching it proves nothing about
       * whether an account exists, so repeating the address a stranger typed
       * would turn a neutral screen into a confirmation. */}
      <p className="mt-4 text-[14.4px] leading-[1.7] text-ink-2">{C.codeIntro}</p>

      <form action={verify} className="mt-8 flex flex-col gap-8">
        <Field
          id={codeId}
          label={C.codeLabel}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          error={state.error}
        />
        <Submit label={C.verifyLabel} pending={verifying} />
      </form>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <form
          action={(formData) => {
            setCooldown(RESEND_COOLDOWN_SECONDS);
            resend(formData);
          }}
        >
          <input type="hidden" name="identifier" value={sent.sentTo?.value ?? ""} />
          <button
            type="submit"
            disabled={resending || cooldown > 0}
            className="ease-brand text-[13px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink disabled:opacity-55"
          >
            {cooldown > 0 ? C.resendWait(cooldown) : C.resendLabel}
          </button>
        </form>

        <button
          type="button"
          onClick={onChange}
          className="ease-brand text-[13px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
        >
          {C.changeLabel}
        </button>
      </div>

      {resendState.error ? (
        <p role="alert" className="mt-3 text-[13px] text-critical">
          {resendState.error}
        </p>
      ) : null}
    </div>
  );
}
