import type { Metadata } from "next";

/**
 * Member surfaces inherit nothing describable from the marketing site.
 *
 * The root layout sets `description` to the §3.1 marketing sub, which names both
 * conditions — correct on a page whose job is to be found, wrong on a screen
 * someone is filling in. Social cards were already neutral (the root uses the
 * §3.4 landing copy for Open Graph), but the plain description tag still rode
 * along, doing no work on a noindex page and carrying real disclosure risk.
 *
 * Nulling it here covers every onboarding step at once, including the ones not
 * written yet — which is the point of putting it in the layout rather than
 * remembering it per page.
 */
export const metadata: Metadata = {
  description: null,
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
