import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { SiteFooter } from "../site-footer";
import { WaitlistForm } from "./waitlist-form";
import { PublicShell } from "@/app/ui";

const C = DRAFT_COPY.waitlist;

/**
 * The front door while Plus One is in a closed beta.
 *
 * ── the metadata is not boilerplate ─────────────────────────────────────────
 *
 * A link preview is seen by more people than the page is — the same reasoning
 * `/i/[code]` carries, and it applies harder here because this URL is the one
 * that gets shared. The description says who the app is FOR and never assumes
 * anything about the reader, so a preview appearing in a group chat outs
 * nobody who was sent it.
 */
export const metadata: Metadata = {
  title: C.heading,
  description: C.intro,
  openGraph: { title: C.heading, description: C.intro, type: "website" },
};

export default function WaitlistPage() {
  return (
    <>
      <PublicShell variant="act" wide>
        <h1 className="mt-12 max-w-[18ch] text-h1 text-balance">{C.heading}</h1>
        <p className="mt-6 max-w-[46ch] text-body leading-[1.7] text-ink-2">{C.intro}</p>

        <WaitlistForm />
      </PublicShell>
      <SiteFooter />
    </>
  );
}
