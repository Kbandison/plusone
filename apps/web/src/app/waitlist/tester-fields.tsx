"use client";

import { useId, useState } from "react";

import { BETA_INSTALL, DRAFT_COPY, betaInstallFor } from "@plusone/config";

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
 *
 * ── the store address is asked PER PLATFORM, and iOS no longer needs one ─────
 *
 * A TestFlight public link enrols the tester itself, so from 2026-09-17 nobody
 * opens App Store Connect for them and their Apple ID is an identifier held for
 * nothing. That is the exact thing WAITLIST_NEVER refuses, and a field that
 * USED to be justified gets no exemption from it.
 *
 * Read off `betaInstallFor` rather than a check for "ios", so the day the link
 * is withdrawn the field comes back on its own — and the day Android gets one,
 * that field goes. The alternative is a condition that agrees with the config
 * until somebody changes one of them.
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

  const initial = platform === "ios" || platform === "android" ? platform : null;
  // The radio is the live answer, not the prop. The prop is what they saved
  // last time; whether to ask for an address depends on what they have just
  // picked, and the field has to appear and disappear as they pick it.
  const [chosen, setChosen] = useState<"ios" | "android" | null>(initial);

  // Null when that platform's link enrols the tester on its own.
  const install = chosen ? betaInstallFor(chosen) : null;
  const accountLabel = install?.accountLabel ?? null;

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
                    defaultChecked={initial === id}
                    onChange={() => setChosen(id)}
                    required
                    className="size-5 shrink-0 accent-accent"
                  />
                  {BETA_INSTALL[id].label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-[1.6] text-ink-3">{C.platformHint}</p>
          </fieldset>

          {/* Only where somebody still has to be added by hand. Android's
              closed-testing list needs a Google account pasted onto it; iOS
              does not, since the public link enrols the tester. */}
          {accountLabel ? (
            <Field
              id={storeEmailId}
              label={accountLabel}
              // The hint is what stops a tester giving the wrong address — it is
              // the Google account on the phone, not the one they read mail on.
              // Never absent while a label exists, and typed as though it could
              // be, so it is spread rather than passed as undefined.
              {...(install?.accountHint ? { hint: install.accountHint } : {})}
              name="storeEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              defaultValue={storeEmail ?? ""}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
