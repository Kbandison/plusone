import { RouteModal } from "@/app/route-modal";

import { ConnectSkeleton } from "../../../connect/connect-skeleton";

/**
 * The panel opens on the tap.
 *
 * Same shape as the thread's: a parallel slot needs its own loading state, and
 * the nearest boundary above it is the app root's — which would replace the
 * whole tab behind the sheet rather than filling the sheet.
 */
export default function Loading() {
  return (
    <RouteModal>
      <ConnectSkeleton />
    </RouteModal>
  );
}
