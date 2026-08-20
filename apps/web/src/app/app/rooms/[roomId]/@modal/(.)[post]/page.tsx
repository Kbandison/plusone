import { RouteModal } from "@/app/route-modal";
import { Thread } from "../../thread";

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
      <Thread roomId={roomId} postId={post} />
    </RouteModal>
  );
}
