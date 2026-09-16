"use client";

import Link from "next/link";

import { BETA_WELCOME, BETA_WELCOME_STORAGE_KEY, HINTS } from "@plusone/config";

import { Button } from "@/app/ui";
import { Modal } from "@/app/modal";
import { useLocalFlags } from "./local-flags";

/**
 * The one thing a beta tester meets that a member does not.
 *
 * Rendered by the layout for anybody with `joined_in_beta`, and it shows once.
 *
 * ── it renders NOTHING until it knows ──────────────────────────────────────
 *
 * `flags` is null on the server and on the first client pass, and this returns
 * null for both. Opening first and checking storage afterwards would flash a
 * welcome at somebody who dismissed it last week, which is worse than never
 * showing it — a dialog that appears and vanishes reads as a bug in the app
 * they were asked to find bugs in.
 *
 * ── the four mechanics are read off HINTS ──────────────────────────────────
 *
 * Kevin asked for them named here AND kept as hints in context, which is two
 * copies of one sentence. hints.ts says in as many words that a second copy
 * drifts — so there is no list in this file. Add a hint and this grows a line.
 *
 * ── dismissal is remembered on the way OUT, not on the button ──────────────
 *
 * `onDismiss` fires for Escape, the backdrop and the X as well as the button,
 * so there is no way to close this that leaves it un-remembered and no way to
 * be shown it twice in one session.
 */
export function BetaWelcome() {
  const { flags, has, add } = useLocalFlags(BETA_WELCOME_STORAGE_KEY);

  if (flags === null || has("seen")) return null;

  return (
    <Modal
      openOnMount
      onDismiss={() => add("seen")}
      heading={BETA_WELCOME.heading}
      panelClassName="text-left"
    >
      {(close) => (
        <div className="mt-4 flex flex-col gap-6">
          <p className="text-body leading-[1.7] text-ink-2">{BETA_WELCOME.opening}</p>

          {/* The premium promise, and the timing in the same breath as it.
              Somebody who reads "free premium" and then finds Settings saying
              otherwise has been misled, however carefully a later sentence is
              worded. */}
          <div className="rounded-xl border border-line-2 bg-surface-2 p-4">
            <p className="text-[14.6px] font-bold">{BETA_WELCOME.premium.heading}</p>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-2">
              {BETA_WELCOME.premium.body}
            </p>
          </div>

          <div>
            <p className="text-[12.2px] tracking-[0.08em] text-ink-3 uppercase">
              {BETA_WELCOME.mechanics.heading}
            </p>
            {/* From HINTS. No list lives in this file — see the note above. */}
            <ul className="mt-3 flex flex-col gap-2">
              {HINTS.map((hint) => (
                <li key={hint.id} className="flex gap-2.5 text-[13px] leading-[1.6] text-ink-2">
                  <span aria-hidden="true" className="text-accent">
                    ·
                  </span>
                  {hint.oneLine}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[14.6px] font-bold">{BETA_WELCOME.checklist.heading}</p>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-2">
              {BETA_WELCOME.checklist.body}
            </p>
            {/* Closes as well as navigates. The dialog is modal, so leaving it
                open behind a route change leaves the page inert. */}
            <Link
              href="/app/beta"
              onClick={close}
              className="ease-brand mt-3 inline-flex min-h-tap items-center text-[13px] text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:decoration-accent"
            >
              {BETA_WELCOME.checklist.cta}
            </Link>
          </div>

          {/* The shared primitive. design-system.test.ts caught the hand-rolled
              version of this, which is the thirteen-spellings argument working
              exactly as intended. */}
          <Button type="button" onClick={close} className="w-full">
            {BETA_WELCOME.dismiss}
          </Button>
        </div>
      )}
    </Modal>
  );
}
