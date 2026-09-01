"use client";

import { useId } from "react";

import { BETA_INSTALL, DRAFT_COPY } from "@plusone/config";

import { CheckField, Field } from "@/app/auth-fields";

const C = DRAFT_COPY.waitlist;

/**
 * The testing question, and the two fields that only appear once it is yes.
 *
 * ── why these are on the join form at all ───────────────────────────────────
 *
 * They were asked later, on `/beta/<code>`, so that a store identity was only
 * held for somebody actually invited. The instinct was right and the sequencing
 * was wrong: nobody could be added to a Play or TestFlight list until they came
 * back and filled in a SECOND form, so every invitation was a round trip that
 * might take days or never happen — the exact delay the admin screen exists to
 * remove.
 *
 * Conditional fields keep both properties. Tick nothing and nothing extra is
 * asked or stored. Tick it and you have self-selected, which is the one moment
 * asking for a Google account or an Apple ID is justified.
 *
 * ── and why they are required once it is ticked ─────────────────────────────
 *
 * Optional would reproduce the original problem for anybody who skipped them.
 * The cost is one field at the moment somebody is volunteering to help, and the
 * hint tells them exactly which address — which is the thing they get wrong.
 */
export function TesterFields({
  wantsBeta,
  onWantsBetaChange,
  platform,
  storeEmail,
}: {
  wantsBeta: boolean;
  onWantsBetaChange: (next: boolean) => void;
  platform?: string | null;
  storeEmail?: string | null;
}) {
  const betaId = useId();
  const storeEmailId = useId();

  const chosen = platform === "ios" || platform === "android" ? platform : null;

  return (
    <>
      <CheckField
        id={betaId}
        label={C.betaLabel}
        hint={C.betaHelp}
        name="beta"
        checked={wantsBeta}
        onChange={(event) => onWantsBetaChange(event.currentTarget.checked)}
      />

      {wantsBeta ? (
        <div className="flex flex-col gap-6 border-l border-line-2 pl-5">
          <fieldset>
            <legend className="text-[12.2px]">{C.platformLabel}</legend>
            <div className="mt-3 flex flex-col gap-1">
              {(["android", "ios"] as const).map((id) => (
                <label key={id} className="min-h-tap flex items-center gap-3 text-[12.6px]">
                  <input
                    type="radio"
                    name="platform"
                    value={id}
                    defaultChecked={chosen === id}
                    required
                    className="size-5 shrink-0 accent-accent"
                  />
                  {BETA_INSTALL[id].label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-[1.6] text-ink-3">{C.platformHint}</p>
          </fieldset>

          <Field
            id={storeEmailId}
            label={C.storeEmailLabel}
            hint={C.storeEmailHint}
            name="storeEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={storeEmail ?? ""}
          />
        </div>
      ) : null}
    </>
  );
}
