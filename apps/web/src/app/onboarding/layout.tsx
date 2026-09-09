import type { Metadata } from "next";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

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
 *
 * There was a `force-dynamic` here saying the same thing about rendering:
 * every onboarding screen is a function of who is asking, so a static copy
 * would at best be wrong and at worst be someone else's. It is GONE, not
 * relaxed — `cacheComponents` makes data fetching dynamic by default and
 * refuses the config outright, so the property is now the framework's rather
 * than this file's.
 *
 * The trap it recorded is still worth knowing: relying on `cookies()` to opt a
 * route out was never enough, because the environment is parsed before the
 * first cookie read, so a build-time render fails there rather than bailing out
 * cleanly.
 */

export const metadata: Metadata = {
  description: null,
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
