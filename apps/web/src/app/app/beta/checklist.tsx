"use client";

import Link from "next/link";

import { BETA_CHECKLIST, BETA_CHECKLIST_STORAGE_KEY } from "@plusone/config";

import { useLocalFlags } from "../local-flags";

/**
 * What is worth trying, and what you have tried.
 *
 * ── the ticks are the TESTER'S, and never leave their device ───────────────
 *
 * The alternative Kevin weighed was reporting coverage back to an admin screen.
 * That is a table, column grants, a privacy classification and both store
 * data-safety forms — and, underneath all of it, a record of which parts of an
 * HSV and HIV app a named person used. The value he was after is telling
 * somebody what is worth poking at; the ticking is their own bookkeeping. What
 * comes back is the bug, through /app/feedback, which already exists.
 *
 * ── every row says why ─────────────────────────────────────────────────────
 *
 * "Send a connect" with no reason is a chore. The reason is what makes it a
 * request — and half of these exist because a session genuinely cannot check
 * them: three engines, a real phone, and another person on the other end.
 */
export function Checklist() {
  const { flags, has, toggle } = useLocalFlags(BETA_CHECKLIST_STORAGE_KEY);

  // Null until the first client pass. The count would otherwise render 0 and
  // then jump, which on a checklist reads as ticks having been lost.
  const done = flags === null ? null : BETA_CHECKLIST.filter((c) => has(c.id)).length;

  return (
    <div className="mt-6 flex flex-col gap-3">
      <p className="text-[12.2px] tabular-nums text-ink-3" aria-live="polite">
        {done === null ? " " : `${done} of ${BETA_CHECKLIST.length} tried`}
      </p>

      <ul className="flex flex-col gap-2">
        {BETA_CHECKLIST.map((check) => {
          const ticked = has(check.id);
          return (
            <li key={check.id} className="rounded-xl border border-line-2 bg-surface p-4">
              <label className="flex min-h-tap cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={() => toggle(check.id)}
                  className="mt-0.5 size-5 shrink-0 accent-accent"
                />
                <span className="flex-1">
                  <span
                    className={`text-[14px] font-bold ${ticked ? "text-ink-3 line-through" : ""}`}
                  >
                    {check.label}
                  </span>
                  <span className="mt-1 block text-[12.6px] leading-[1.6] text-ink-3">
                    {check.why}
                  </span>
                </span>
              </label>
              {/* Outside the label, or tapping the link would toggle the box. */}
              <Link
                href={check.href}
                className="ease-brand mt-2 ml-8 inline-flex min-h-tap items-center text-[12.6px] text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:decoration-accent"
              >
                Go there
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
