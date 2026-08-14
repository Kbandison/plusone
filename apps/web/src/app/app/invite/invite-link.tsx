"use client";

import { useState } from "react";

import { DRAFT_COPY } from "@plusone/config";

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-8 flex flex-col gap-4">
      <p className="rounded-lg border border-line-2 bg-surface px-4 py-3.5 text-[15px] break-all text-ink-2">
        {url}
      </p>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
        className="ease-brand self-start rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90"
      >
        {copied ? DRAFT_COPY.app.inviteCopied : DRAFT_COPY.app.inviteCopyLabel}
      </button>
    </div>
  );
}
