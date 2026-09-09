import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { ConnectPanel } from "./connect-panel";

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

export const metadata: Metadata = { title: DRAFT_COPY.app.connectHeading };

/**
 * The whole page, for a hard load — a shared link, a refresh, or an arrival
 * from outside the app. A soft navigation from the Drop or Browse is caught by
 * the intercepting route at app/@modal and opens the same panel in a sheet.
 */
export default async function ConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string; room?: string }>;
}) {
  const { id } = await params;
  const { source, room } = await searchParams;

  return (
    <main id="main">
      <ConnectPanel id={id} source={source} room={room} />
    </main>
  );
}
