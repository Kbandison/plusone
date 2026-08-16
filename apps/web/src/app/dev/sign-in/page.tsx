import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parseServerEnv } from "@plusone/config";

import { DevSignInForm } from "./form";
import { devSignInAllowed } from "./guard";

export const metadata: Metadata = {
  title: "Development sign-in",
  robots: { index: false, follow: false },
};

/**
 * A way into the app without an SMS, for development.
 *
 * Testing this product needs several members at once — the Drop needs a pool,
 * a connect needs someone to send it to, a chat needs two people, and the walls
 * only mean anything with somebody on the other side of them. Preset numbers
 * are here so those accounts are the same ones every time rather than whatever
 * got typed.
 *
 * notFound() rather than a message: in production this route should not appear
 * to exist. The action behind it refuses independently, because a page guard
 * and an action guard protect different things.
 */
export default function DevSignInPage() {
  const env = parseServerEnv(process.env);
  if (!devSignInAllowed(process.env["NODE_ENV"], env.OTP_PROVIDER)) notFound();

  return (
    <main id="main" className="mx-auto w-full max-w-[560px] px-6 py-16">
      <h1 className="text-[clamp(1.8rem,5vw,2.2rem)]">Development sign-in</h1>
      <p className="mt-5 text-[16px] leading-[1.7] text-ink-2">
        No SMS is sent. This mints a real session for a phone-confirmed member, so every wall,
        policy and onboarding step behaves exactly as it will in production.
      </p>
      <p className="mt-3 text-[14.5px] text-ink-3">
        Only exists while <code>OTP_PROVIDER=stub</code> and never in production.
      </p>

      <DevSignInForm />
    </main>
  );
}
