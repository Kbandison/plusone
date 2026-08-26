import { DRAFT_COPY } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import type { SubscriptionSource } from "@/lib/subscription-source";

const C = DRAFT_COPY.app;

/**
 * Where a store subscription is cancelled, which is never here.
 *
 * Apple and Google will not let anyone but themselves end a subscription they
 * sold, so this is a link rather than a button that does something — and the
 * distinction matters to whoever reads it, which is why it says "Manage" rather
 * than "Cancel". The same screen changes a plan, turns auto-renew off, or does
 * nothing at all.
 *
 * A plain anchor and no client JavaScript. `ManageBilling` beside it has to be
 * a client component because it posts to a server action for a portal session;
 * there is nothing to post here, and a link that works with scripting broken is
 * strictly better on a page about somebody's money.
 *
 * ── this one is allowed inside the shell ────────────────────────────────────
 *
 * `plan-buttons.tsx` hides both the checkout and the billing portal in the
 * native shell, on 3.1.1 and 3.1.3(f) — a portal can change a plan, which is a
 * purchase. This is the opposite case: Apple REQUIRES that an IAP subscription
 * be managed through their own screen, and on an iPhone this URL opens Settings
 * rather than a web page. Hiding it would leave a member no way to cancel from
 * the app they bought it in.
 */
export function ManageStoreSubscription({
  source,
  url,
}: {
  source: SubscriptionSource;
  url: string;
}) {
  const apple = source === "apple";
  return (
    <div className="mt-6">
      <p className="text-[11.7px] text-ink-3">{apple ? C.premiumFromApple : C.premiumFromGoogle}</p>
      <a
        href={url}
        // Out of the app either way: in a browser it is another site, and in the
        // shell Capacitor hands any origin outside `server.url` to the system,
        // which is what turns this into the Settings screen on an iPhone.
        target="_blank"
        rel="noreferrer"
        className={`${buttonClass("secondary")} mt-3 inline-block`}
      >
        {apple ? C.premiumManageAppleLabel : C.premiumManageGoogleLabel}
      </a>
    </div>
  );
}
