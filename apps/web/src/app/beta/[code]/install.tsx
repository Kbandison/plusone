"use client";

import { useActionState, useId, useState } from "react";

import { BETA_INSTALL, BETA_LINKS, betaInstallFor, type BetaPlatform } from "@plusone/config";

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
export function Install({
  code,
  known,
}: {
  code: string;
  /**
   * What the join form already collected.
   *
   * When it is here the platform is pre-selected and the address is not asked
   * for again — the steps and the links are the whole job of this component
   * now. Asking a second time for something somebody already typed reads as
   * the first answer having been lost.
   */
  known?: { platform: "ios" | "android"; email: string } | null;
}) {
  const [platform, setPlatform] = useState<BetaPlatform | null>(known?.platform ?? null);
  const [saved, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await saveStoreAccount(formData);
    return true;
  }, false);
  const emailId = useId();

  // The resolver, not the record: with a TestFlight public link turned on, iOS
  // stops asking for an Apple ID it no longer has any use for.
  const chosen = platform ? betaInstallFor(platform) : null;

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

          {/* Both Android links, in the order they work in, and only AFTER the
              account has been saved.
        
              The opt-in page tells an unlisted person the programme is not
              available and the store says the app cannot be found — so showing
              these to somebody who has not given us their Google account yet is
              handing them two dead ends that look like our mistake. They are
              rendered here rather than in the invitation email for the same
              reason: at invite time we do not know their platform. */}
          {platform === "android" && saved ? (
            <div className="mt-5 flex flex-col gap-3">
              <a
                href={BETA_LINKS.android.optIn}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary", "self-start")}
              >
                1 · Become a tester
              </a>
              <a
                href={BETA_LINKS.android.store}
                target="_blank"
                rel="noreferrer"
                className="text-[12.6px] text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink"
              >
                2 · Then install from Google Play
              </a>
            </div>
          ) : null}

          {/* Null today: TestFlight is individual invitations, so there is no
              URL to show and Apple's email is the thing to watch for. */}
          {platform === "ios" && BETA_LINKS.ios.publicLink ? (
            <a
              href={BETA_LINKS.ios.publicLink}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "mt-5 self-start")}
            >
              Open in TestFlight
            </a>
          ) : null}

          {/* Known already: say so rather than asking again, and give them a
              way to correct it if the wrong account got typed. */}
          {known && platform === known.platform ? (
            <p className="mt-6 text-[11.7px] leading-[1.6] text-ink-3">
              We have {known.email} for this. If that is the wrong account, reply to the invitation
              email and we will change it.
            </p>
          ) : chosen.accountLabel ? (
            saved ? (
              <p className="mt-6 text-[11.7px] leading-[1.6] text-ink-2">
                {/* Only reachable when an account was asked for, which is
                    Android, or iOS on the invitation route. The public-link
                    variant asks for nothing and never renders this. */}
                {platform === "android"
                  ? "Saved. Once we have added that account — usually within a day — the two links below will work, in that order."
                  : "Saved. We will add that Apple ID to TestFlight, and Apple will email you an invitation to that address. Install TestFlight from the App Store first if you have not."}
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
