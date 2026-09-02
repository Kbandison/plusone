"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";

import {
  BETA_INSTALL,
  BETA_LINKS,
  DRAFT_COPY,
  betaInstallFor,
  type BetaPlatform,
} from "@plusone/config";

import { Field } from "@/app/auth-fields";
import { inNativeShell } from "@/lib/native-shell";
import { buttonClass } from "@/app/ui";
import { saveStoreAccount } from "./actions";

const C = DRAFT_COPY.betaInvite;

/**
 * How a tester actually gets the app.
 *
 * ── it does not ask what it already knows ───────────────────────────────────
 *
 * The platform and the store account are collected on the JOIN form now, of
 * anybody who ticked the testing box. This component kept asking anyway: the
 * account field was correctly suppressed, but the platform radios were
 * unconditional, so an invited tester opened their email and met a form asking
 * a question they had already answered. A second form is exactly what moving
 * the question to signup was meant to remove.
 *
 * So when we know: no picker, the steps for their phone straight away, and a
 * quiet way out for somebody testing on a different device than they said.
 *
 * ── and the browser link says where it goes ─────────────────────────────────
 *
 * The page led with a primary button labelled "Start" that opened the web app,
 * above the install steps — so the most prominent thing on an invitation to
 * install an app took you somewhere else without saying so. It is below the
 * steps now and it names the browser.
 *
 * That the web app is the same app is still true and still worth saying. What
 * was wrong was the ordering and the label, not the offer.
 */
export function Install({
  code,
  known,
}: {
  code: string;
  /** What the join form already collected, when it did. */
  known?: { platform: "ios" | "android"; email: string } | null;
}) {
  /**
   * Inside the app, none of the install steps below apply.
   *
   * This page can only be reached in the shell because `/beta/*` is claimed in
   * the association file, and being reached there is the entire point of
   * claiming it: fetching the page is what sets the `plusone_beta` cookie, and
   * WKWebView has its own jar. So by the time this renders in the app the work
   * is done and the only useful thing left is a way onward.
   *
   * Read in an effect rather than during render, with the same disable and the
   * same reasoning as `push-toggle.tsx` and `install-app.tsx`: `inNativeShell`
   * asks the window, the server has no window, and a useState initializer would
   * return false there and true on hydration — a hydration error rather than a
   * wrong button. The install block is the correct answer for everybody the
   * server renders for, so the browser case is never wrong and only the app
   * corrects itself.
   */
  const [inShell, setInShell] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.Capacitor, which does not exist during a server render
  useEffect(() => setInShell(inNativeShell()), []);

  const [picking, setPicking] = useState(false);
  const [platform, setPlatform] = useState<BetaPlatform | null>(known?.platform ?? null);
  const [saved, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await saveStoreAccount(formData);
    return true;
  }, false);
  const emailId = useId();

  const chosen = platform ? betaInstallFor(platform) : null;

  if (inShell) {
    return (
      <div className="mt-8">
        <h2 className="text-h3">{C.inAppHeading}</h2>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">{C.inAppBody}</p>
        <Link href="/onboarding/phone" className={buttonClass("primary", "mt-6 self-start")}>
          {C.inAppContinue}
        </Link>
      </div>
    );
  }
  // The account is settled if it came from signup and they have not since said
  // they are on a different phone.
  const settled = Boolean(known) && !picking && platform === known?.platform;

  return (
    <div className="mt-8 border-t border-line-2 pt-8">
      {settled ? null : (
        <fieldset>
          <legend className="text-[13.8px]">{C.whichDevice}</legend>
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
      )}

      {chosen ? (
        <div className={settled ? "" : "mt-8"}>
          {/* Which set of steps depends on whether somebody has already been
              added to the track.
            
              `settled` means the store account came from the JOIN form, which
              is the normal case: an invitation is only sent once that exists,
              and whoever sends it adds them to the track in the same sitting.
              So by the time this page is open, being added has happened — and
              telling them "we add your Apple ID" in the future tense describes
              a step that is finished and reads as a delay that is not there.
            
              The pending set is for the exception: a row that predates the join
              form, or somebody who has just said they are on a different phone
              than they told us. Nobody has added those yet. */}
          <h3 className="text-[13.8px]">{chosen.heading}</h3>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[12.6px] leading-[1.6] text-ink-2">
            {(settled ? chosen.steps : chosen.pendingSteps).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          {(settled ? chosen.wait : chosen.pendingWait) ? (
            <p className="mt-4 text-[11.7px] leading-[1.6] text-ink-3">
              {settled ? chosen.wait : chosen.pendingWait}
            </p>
          ) : null}

          {/* Both Android links, in the order they work in. The opt-in page
              tells an unlisted person the programme is unavailable and the
              store says the app cannot be found, so these appear only once the
              account is settled — before that they are two dead ends that look
              like our mistake. */}
          {platform === "android" && (settled || saved) ? (
            <div className="mt-5 flex flex-col gap-3">
              <a
                href={BETA_LINKS.android.optIn}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("primary", "self-start")}
              >
                {C.becomeTester}
              </a>
              <a
                href={BETA_LINKS.android.store}
                target="_blank"
                rel="noreferrer"
                className="text-[12.6px] text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink"
              >
                {C.thenInstall}
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
              className={buttonClass("primary", "mt-5 self-start")}
            >
              {C.openTestFlight}
            </a>
          ) : null}

          {settled ? (
            <>
              <p className="mt-5 text-[11.7px] leading-[1.6] text-ink-3">
                {C.accountOnFile(known?.email ?? "")}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPicking(true);
                  setPlatform(null);
                }}
                className="ease-brand min-h-tap text-[11.7px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
              >
                {C.differentPhone}
              </button>
            </>
          ) : saved ? (
            <p className="mt-6 text-[11.7px] leading-[1.6] text-ink-2">
              {platform === "android" ? C.savedAndroid : C.savedIos}
            </p>
          ) : chosen.accountLabel ? (
            <form action={submit} className="mt-6 flex flex-col gap-5">
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="platform" value={platform ?? ""} />

              <Field
                id={emailId}
                label={chosen.accountLabel}
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
                {C.save}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Below the steps, and it says where it goes. */}
      <div className="mt-8 border-t border-line-2 pt-6">
        <Link href="/onboarding/phone" className={buttonClass("secondary", "self-start")}>
          {C.openInBrowser}
        </Link>
        <p className="mt-3 text-[11px] leading-[1.6] text-ink-3">{C.browserNote}</p>
      </div>
    </div>
  );
}
