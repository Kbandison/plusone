"use client";

import { useActionState, useId, useState } from "react";

import { BETA_INSTALL, BETA_OPT_IN_URL, type BetaPlatform } from "@plusone/config";

import { Field } from "@/app/auth-fields";
import { buttonClass } from "@/app/ui";
import { saveStoreAccount } from "./actions";

/**
 * How a tester actually gets the app.
 *
 * ── what this replaces, and why it was wrong ────────────────────────────────
 *
 * The first version of this page said "you are invited", offered a Start button
 * into web onboarding, and hid the store-account question in a collapsed fold
 * BELOW it. So the one question that determines everything about a tester's
 * next week was an afterthought, and the journey it leads to — give the right
 * address, wait to be added to a store track, install from the store — was
 * described nowhere at all.
 *
 * ── the ordering here is the fix ────────────────────────────────────────────
 *
 * Platform first, because it decides which address we need and what happens
 * next. Then the steps, shown as soon as a platform is picked and BEFORE the
 * address is saved — somebody who wants to know what they are signing up for
 * should not have to submit a form to find out.
 *
 * And the browser option is a real answer rather than a way to decline. The
 * TWA is Chrome running this site and the iOS shell is a WKWebView pointed at
 * it, so the web app IS the app. Saying that removes the store wait from the
 * critical path entirely.
 */
export function Install({ code }: { code: string }) {
  const [platform, setPlatform] = useState<BetaPlatform | null>(null);
  const [saved, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await saveStoreAccount(formData);
    return true;
  }, false);
  const emailId = useId();

  const chosen = platform ? BETA_INSTALL[platform] : null;
  const optIn = platform === "android" || platform === "ios" ? BETA_OPT_IN_URL[platform] : null;

  return (
    <div className="mt-8 border-t border-line-2 pt-8">
      <fieldset>
        <legend className="text-[13.8px]">Which will you use it on?</legend>
        <div className="mt-4 flex flex-col gap-2">
          {(Object.keys(BETA_INSTALL) as BetaPlatform[]).map((id) => (
            <label key={id} className="min-h-tap flex items-center gap-3 text-[12.6px]">
              <input
                type="radio"
                name="platformChoice"
                value={id}
                checked={platform === id}
                onChange={() => setPlatform(id)}
                className="size-5 shrink-0 accent-accent"
              />
              {BETA_INSTALL[id].label}
            </label>
          ))}
        </div>
      </fieldset>

      {chosen ? (
        <div className="mt-8">
          <h3 className="text-[13.8px]">{chosen.heading}</h3>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[12.6px] leading-[1.6] text-ink-2">
            {chosen.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          {chosen.wait ? (
            <p className="mt-4 text-[11.7px] leading-[1.6] text-ink-3">{chosen.wait}</p>
          ) : null}

          {/* Rendered only when we actually have one. A store opt-in link is
              read off a console this repo cannot reach, so null is the normal
              state and the steps above are written to be complete without it —
              an invented URL would send a tester to somebody else's app with no
              way to tell. */}
          {optIn ? (
            <a
              href={optIn}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "mt-5 self-start")}
            >
              Open the tester link
            </a>
          ) : null}

          {chosen.accountLabel ? (
            saved ? (
              <p className="mt-6 text-[11.7px] text-ink-2">
                Saved. We will add that account to the test group.
              </p>
            ) : (
              <form action={submit} className="mt-6 flex flex-col gap-5">
                <input type="hidden" name="code" value={code} />
                <input type="hidden" name="platform" value={platform ?? ""} />

                <Field
                  id={emailId}
                  label={chosen.accountLabel}
                  // `?? undefined` is not enough under exactOptionalPropertyTypes:
                  // passing undefined explicitly is not the same as omitting the
                  // prop. Spread an empty object instead when there is no hint.
                  {...(chosen.accountHint ? { hint: chosen.accountHint } : {})}
                  name="storeEmail"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                />

                <button
                  type="submit"
                  disabled={pending}
                  className={buttonClass("secondary", "self-start")}
                >
                  Save
                </button>
              </form>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
