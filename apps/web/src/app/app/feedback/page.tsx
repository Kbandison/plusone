import type { Metadata } from "next";

import { FeedbackPanel } from "./feedback-panel";

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

export const metadata: Metadata = { title: "Report a problem" };

/**
 * Where a member says something is broken, or should exist.
 *
 * The full page. The header icon opens the same thing as a sheet through the
 * intercepting route in @modal — this is what a hard load, a refresh or a
 * shared link gets, and the contents live in FeedbackPanel so the two cannot
 * drift.
 *
 * ── they can see what happened to it, and that is the point ─────────────────
 *
 * A public roadmap with upvotes is the obvious alternative and it is refused in
 * config/feedback.ts: a feature request carries a name, and a name on a board
 * belonging to an HSV and HIV app is a disclosure nobody set out to make.
 *
 * What a board is actually FOR, from where the member is standing, is knowing
 * their report did not vanish. That needs no board — it needs the status of
 * their own reports, which is what the list is. `declined` is shown as plainly
 * as `done`, because being told no is a better outcome than watching something
 * that will never move.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <main id="main">
      <FeedbackPanel from={from ?? ""} />
    </main>
  );
}
