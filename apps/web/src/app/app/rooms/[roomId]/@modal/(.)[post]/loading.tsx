import { RouteModal } from "@/app/route-modal";

import { ThreadSkeleton } from "../../thread-skeleton";

/**
 * The sheet opens on the tap, not three round trips later.
 *
 * A parallel slot streams independently and takes its own loading state — the
 * nearest boundary above this one is `rooms/loading.tsx`, which sits above BOTH
 * slots, so without this file the room behind the sheet is what gets replaced.
 *
 * `RouteModal` is here rather than only in the page because the dialog is the
 * part that has to arrive immediately: `Thread` waits on `auth.getUser()`, then
 * `room_thread`, then the photos those rows name, and until this existed none
 * of that had anything on screen in front of it. The tap looked ignored.
 */
export default function Loading() {
  return (
    <RouteModal>
      <ThreadSkeleton />
    </RouteModal>
  );
}
