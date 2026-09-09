import { RouteModal } from "@/app/route-modal";
import { LiveRefresh } from "@/app/app/live-refresh";
import { Thread } from "../../thread";

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
 * The thread, over the room it belongs to.
 *
 * `(.)` intercepts the sibling `[post]` segment: @modal is a slot rather than a
 * route segment, so from here `[post]` is one level across and not one level
 * up. This renders only on a soft navigation from inside the room — a shared
 * link, a refresh or an arrival from outside falls through to the page, which
 * is the same Thread without the dialog around it.
 */
export default async function ThreadModal({
  params,
}: {
  params: Promise<{ roomId: string; post: string }>;
}) {
  const { roomId, post } = await params;

  return (
    <RouteModal>
      {/* And in the modal, which is the same thread reached from the feed.
       Without this, whether a reply appears depends on how you opened it. */}
      <LiveRefresh watch={[{ table: "rooms", filter: `id=eq.${roomId}` }]} />

      <Thread roomId={roomId} postId={post} />
    </RouteModal>
  );
}
