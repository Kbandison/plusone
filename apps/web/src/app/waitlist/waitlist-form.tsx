"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";

import { DRAFT_COPY, METROS } from "@plusone/config";

import { Field, SelectField, Submit } from "@/app/auth-fields";
import { TesterFields } from "./tester-fields";
import { Card } from "@/app/ui";
import { join } from "./actions";
import { WAITLIST_INITIAL } from "./state";

const C = DRAFT_COPY.waitlist;

export function WaitlistForm() {
  const [state, submit, pending] = useActionState(join, WAITLIST_INITIAL);
  const emailId = useId();
  const metroId = useId();
  const [wantsBeta, setWantsBeta] = useState(false);

  if (state.sent) {
    return (
      <Card className="mt-10">
        <h2 className="text-h3">{C.sent}</h2>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">{C.sentBody}</p>
      </Card>
    );
  }

  return (
    <form action={submit} className="mt-10 flex flex-col gap-8">
      <Field
        id={emailId}
        label={C.emailLabel}
        hint={C.emailHelp}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        error={state.error}
      />

      <SelectField
        id={metroId}
        label={C.metroLabel}
        placeholder={C.metroPlaceholder}
        name="metro"
        options={METROS}
        required
      />

      <TesterFields wantsBeta={wantsBeta} onWantsBetaChange={setWantsBeta} />

      {/* Above the button, not behind a link.
          An address on this list carries an inference about the person, and the
          honest thing is to say what is kept before they decide rather than
          making them go and read a policy to find out. */}
      <p className="text-[11px] leading-[1.6] text-ink-3">{C.holds}</p>

      <Submit label={C.submit} pending={pending} />

      <p className="text-[11.7px] text-ink-2">
        <Link
          href="/sign-in"
          className="underline decoration-line-2 underline-offset-4 hover:text-ink"
        >
          {DRAFT_COPY.betaClosed.signIn}
        </Link>
      </p>
    </form>
  );
}
