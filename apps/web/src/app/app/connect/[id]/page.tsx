import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { ConnectPanel } from "./connect-panel";

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
