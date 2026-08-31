"use client";

import { useActionState } from "react";

import { DRAFT_COPY } from "@plusone/config";

import { Card } from "@/app/ui";
import { Submit } from "@/app/auth-fields";
import { leave } from "./actions";

const C = DRAFT_COPY.waitlistLeave;

export function LeaveForm({ token }: { token: string }) {
  const [done, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await leave(formData);
    return true;
  }, false);

  if (done) {
    return (
      <Card className="mt-12">
        <h1 className="text-h2">{C.heading}</h1>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">{C.body}</p>
      </Card>
    );
  }

  return (
    <Card className="mt-12">
      <h1 className="text-h2">{DRAFT_COPY.waitlist.leaveLink}</h1>
      <p className="mt-3 text-body leading-[1.7] text-ink-2">{C.body}</p>
      <form action={submit} className="mt-8">
        <input type="hidden" name="t" value={token} />
        <Submit label={DRAFT_COPY.waitlist.leaveLink} pending={pending} />
      </form>
    </Card>
  );
}
