"use client";

import { useState } from "react";

import { DRAFT_COPY } from "@plusone/config";
import { buttonClass } from "@/app/ui";

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="mt-8 flex flex-col gap-4">
      <p className="rounded-lg border border-line-control bg-surface px-4 py-3.5 text-[13.6px] break-all text-ink-2">
        {url}
      </p>
      <button
        type="button"
        onClick={async () => {
          // Unhandled, this rejected on an insecure context or a denied
          // permission and the member saw nothing happen at all — no copy, no
          // error, no change. And `copied` never reset, so a button that had
          // worked once read "Copied." forever afterwards.
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 4000);
          } catch {
            setFailed(true);
          }
        }}
        className={buttonClass("primary", "self-start")}
      >
        {copied ? DRAFT_COPY.app.inviteCopied : DRAFT_COPY.app.inviteCopyLabel}
      </button>

      {/* Announced, because the only other signal is a word on the button the
          member has just moved their finger off. */}
      <p role="status" className="sr-only">
        {copied ? DRAFT_COPY.app.inviteCopied : ""}
      </p>
      {failed ? (
        <p role="alert" className="text-[12.6px] text-critical">
          {DRAFT_COPY.app.inviteCopyFailed}
        </p>
      ) : null}
    </div>
  );
}
