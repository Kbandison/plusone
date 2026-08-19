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
 */
export function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-7">
      <Wordmark className="text-[25px]" />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <ButtonLink tone="quiet" href="/sign-in">
          {DRAFT_COPY.home.signIn}
        </ButtonLink>
        <ButtonLink href="/onboarding/phone">{DRAFT_COPY.home.getStarted}</ButtonLink>
      </div>
    </header>
  );
}
