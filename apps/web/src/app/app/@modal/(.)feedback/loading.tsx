import { RouteModal } from "@/app/route-modal";

import { SkeletonLine, SkeletonStatus } from "@/app/app/skeletons";

/**
 * The third slot with no loading state, found by listing every route against
 * its nearest boundary rather than by opening screens.
 *
 * Feedback is reachable from every screen in the app, so the boundary above it
 * is the app root's — which means the tap blanked whichever tab you were on and
 * replaced it with a card skeleton, on the way to opening a sheet over it.
 */
export default function Loading() {
  return (
    <RouteModal>
      <div aria-busy="true">
        <div className="h-6 w-40 animate-pulse rounded-md bg-surface-2" />
        <div className="mt-3 flex flex-col gap-2">
          <SkeletonLine w="w-full" />
          <SkeletonLine w="w-2/3" />
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <div className="h-11 w-full animate-pulse rounded-xl bg-surface-2" />
          <div className="h-28 w-full animate-pulse rounded-xl bg-surface-2" />
          <div className="h-11 w-32 animate-pulse rounded-xl bg-surface-2" />
        </div>
        <SkeletonStatus />
      </div>
    </RouteModal>
  );
}
