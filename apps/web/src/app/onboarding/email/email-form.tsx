"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { DRAFT_COPY, OTP } from "@plusone/config";

import { Field, Submit } from "@/app/auth-fields";
import { confirmBackupEmail, sendBackupEmailCode } from "./actions";
import { BACKUP_EMAIL_INITIAL, type BackupEmailState } from "./state";

const C = DRAFT_COPY.backupEmail;

/**
 * Two states on one screen: the address, then the code. Skip is on both, so
 * nobody is ever stuck on an optional screen — a code that never arrives is a
 * reason to move on, not a dead end.
 */
export function BackupEmailForm({ skipTo }: { skipTo: string }) {
  const [sendState, send, sending] = useActionState(sendBackupEmailCode, BACKUP_EMAIL_INITIAL);
  const emailId = useId();

  if (sendState.sentTo) return <CodeForm sent={sendState} skipTo={skipTo} />;

  return (
    <form action={send} className="mt-10 flex flex-col gap-8">
      <Field
        id={emailId}
        label={C.emailLabel}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        error={sendState.error}
      />
      <Submit label={C.sendLabel} pending={sending} />
      <Skip href={skipTo} />
    </form>
  );
}

function CodeForm({ sent, skipTo }: { sent: BackupEmailState; skipTo: string }) {
  const [state, confirm, confirming] = useActionState(confirmBackupEmail, sent);
  const codeId = useId();

  return (
    <form action={confirm} className="mt-10 flex flex-col gap-8">
      <p className="text-[13px] leading-[1.7] text-ink-2">{C.codePrompt(sent.sentTo ?? "")}</p>
      <Field
        id={codeId}
        label={DRAFT_COPY.phone.codeLabel}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        // The dashboard sets the email code's length and it has been both 6 and
        // 8 — see OTP. A hardcoded 6 once cut sign-in codes short.
        maxLength={OTP.codeMaxLength}
        required
        autoFocus
        error={state.error}
      />
      <Submit label={C.confirmLabel} pending={confirming} />
      <Skip href={skipTo} />
    </form>
  );
}

function Skip({ href }: { href: string }) {
  return (
    <p className="text-[11.7px] text-ink-2">
      <Link href={href} className="underline decoration-line-2 underline-offset-4 hover:text-ink">
        {C.skipLabel}
      </Link>
    </p>
  );
}
