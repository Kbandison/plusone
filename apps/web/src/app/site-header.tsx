import { ButtonLink, Wordmark } from "@/app/ui";
import { DRAFT_COPY } from "@plusone/config";

/**
 * The marketing header.
 *
 * Six public pages — how-it-works, pricing, faq, guidelines, privacy, terms —
 * rendered no wordmark, no header and no call to action. Their only outbound
 * links came from the footer, whose list holds exactly the other six marketing
 * routes: "/", "/onboarding/phone" and "/sign-in" appeared nowhere. Somebody
 * who read the privacy policy — which is the page a careful person reads FIRST
 * on an app like this — could circle the six legal pages forever and never find
 * the way in.
 *
 * The call to action points at `/waitlist` rather than `/onboarding/phone` for
 * the duration of the closed beta. It is the same reasoning as the front page:
 * no account can be created without an invitation, so the old link was a button
 * that led to a refusal — and this one is on every marketing page, which is
 * where somebody who has just read the privacy policy decides.
 */
export function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-7">
      <Wordmark className="text-[21.1px]" />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <ButtonLink tone="quiet" href="/sign-in">
          {DRAFT_COPY.home.signIn}
        </ButtonLink>
        <ButtonLink href="/waitlist">{DRAFT_COPY.waitlist.submit}</ButtonLink>
      </div>
    </header>
  );
}
