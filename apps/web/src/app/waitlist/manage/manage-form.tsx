"use client";

import { useActionState, useId, useState } from "react";

import { DRAFT_COPY, METROS } from "@plusone/config";

import { SelectField, Submit } from "@/app/auth-fields";
import { TesterFields } from "../tester-fields";
import { buttonClass, Card } from "@/app/ui";
import { leave, save } from "./actions";

const C = DRAFT_COPY.waitlistManage;

export function ManageForm({
  token,
  metro,
  wantsBeta,
  invited,
  storePlatform,
  storeEmail,
}: {
  token: string;
  metro: string;
  wantsBeta: boolean;
  invited: boolean;
  storePlatform: "ios" | "android" | null;
  storeEmail: string | null;
}) {
  const [beta, setBeta] = useState(wantsBeta);
  const [saved, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await save(formData);
    return true;
  }, false);
  const [gone, quit, quitting] = useActionState(async (_prev: boolean, formData: FormData) => {
    await leave(formData);
    return true;
  }, false);

  const metroId = useId();

  if (gone) {
    return (
      <Card className="mt-12">
        <h1 className="text-h2">{DRAFT_COPY.waitlistLeave.heading}</h1>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">{DRAFT_COPY.waitlistLeave.body}</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="mt-12">
        <h1 className="text-h2">{C.heading}</h1>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">{C.intro}</p>

        <form action={submit} className="mt-8 flex flex-col gap-8">
          <input type="hidden" name="t" value={token} />

          <SelectField
            id={metroId}
            label={C.areaLabel}
            placeholder={DRAFT_COPY.waitlist.metroPlaceholder}
            name="metro"
            options={METROS}
            defaultValue={metro}
            required
          />

          {/* The same block the join form uses. Somebody who ticks the box
              here has to supply a store account too — otherwise "I changed my
              mind, I will test" produces a row nobody can act on, which is the
              round trip this whole change removes. */}
          <TesterFields
            wantsBeta={beta}
            onWantsBetaChange={setBeta}
            platform={storePlatform}
            storeEmail={storeEmail}
          />

          {/* An invitation already sent is not revoked by unticking a box, and
              somebody who thinks it is will stop looking for the email. */}
          {invited ? (
            <p className="text-[11.7px] leading-[1.6] text-ink-3">{C.invitedNote}</p>
          ) : null}

          <Submit label={C.save} pending={pending} />
          {saved ? <p className="text-[11.7px] text-ink-2">{C.saved}</p> : null}
        </form>
      </Card>

      <Card className="mt-8">
        <h2 className="text-h3">{C.leaveHeading}</h2>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">{C.leaveBody}</p>
        <form action={quit} className="mt-6">
          <input type="hidden" name="t" value={token} />
          {/* Not the primary tone. Leaving is offered honestly and is not the
              thing this page is for — the whole reason it exists is that the
              only door somebody had was the exit. */}
          <button type="submit" disabled={quitting} className={buttonClass("danger")}>
            {DRAFT_COPY.waitlist.leaveLink}
          </button>
        </form>
      </Card>
    </>
  );
}
