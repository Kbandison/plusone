"use client";

import { useActionState, useId, useState } from "react";

import { Field } from "@/app/auth-fields";
import { buttonClass } from "@/app/ui";
import { saveStoreAccount } from "./actions";

/**
 * Which store account this tester will install with.
 *
 * ── why it is asked HERE and not at join ────────────────────────────────────
 *
 * Play needs the tester's Google account address and TestFlight needs their
 * Apple ID. Neither is necessarily the address they gave the waitlist, and both
 * are more identifying than it — a Google account address is usually a real
 * name. Asking at join would mean holding a store identity for every person on
 * the list, including the great majority who will never test anything.
 *
 * Asked here, it is only ever held for somebody who was invited, said they
 * would test, and is standing in front of the invitation.
 *
 * ── and why it is optional ──────────────────────────────────────────────────
 *
 * Skipping must not block the account. Somebody who came for the app rather
 * than for testing should be able to walk past this, and the admin screen
 * counts the ones who did rather than quietly shipping a short list.
 */
export function StoreAccount({ code }: { code: string }) {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [saved, submit, pending] = useActionState(async (_prev: boolean, formData: FormData) => {
    await saveStoreAccount(formData);
    return true;
  }, false);
  const emailId = useId();

  if (saved) {
    return (
      <p className="mt-6 text-[11.7px] text-ink-2">
        Noted. You will get the build invitation from the store itself.
      </p>
    );
  }

  return (
    <details className="mt-8 border-t border-line-2 pt-6">
      <summary className="cursor-pointer text-[12.6px] text-ink-2">
        Testing an early build? Tell us which store account to use
      </summary>

      <form action={submit} className="mt-4 flex flex-col gap-5">
        <input type="hidden" name="code" value={code} />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12.2px]">Which store</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {(["android", "ios"] as const).map((value) => (
              <label key={value} className="min-h-tap flex items-center gap-2 text-[12.6px]">
                <input
                  type="radio"
                  name="platform"
                  value={value}
                  checked={platform === value}
                  onChange={() => setPlatform(value)}
                  className="size-5 shrink-0 accent-accent"
                  required
                />
                {value === "android" ? "Google Play (Android)" : "TestFlight (iPhone)"}
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          id={emailId}
          label={
            platform === "ios" ? "The email on your Apple ID" : "The email on your Google account"
          }
          // The single most common reason a tester cannot find the build: they
          // give the address they use for mail, and the store looks up a
          // different one. Said before they type rather than after it fails.
          hint="It has to be the account signed in on the phone, which is often not the address you gave us."
          name="storeEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
        />

        <button type="submit" disabled={pending} className={buttonClass("secondary", "self-start")}>
          Save
        </button>
      </form>
    </details>
  );
}
