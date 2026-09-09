import { RouteModal } from "@/app/route-modal";
import { ConnectPanel } from "@/app/app/connect/[id]/connect-panel";

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
 * The connect form, over whatever you were looking at.
 *
 * `(.)` intercepts the sibling `connect` segment: @modal is a slot rather than
 * a route segment, so from here `connect` is one level across and not one level
 * up. That covers every screen sharing the /app layout — tonight's Drop, Browse
 * and a room — which is every place a connect starts.
 *
 * Replying to a prompt is a thing you do ABOUT a card, not instead of it.
 * Leaving the grid to write two sentences and coming back to the top of it was
 * the whole reason this is a sheet; a hard load still gets the full page, and
 * the URL stays real either way.
 */
export default async function ConnectModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string; room?: string }>;
}) {
  const { id } = await params;
  const { source, room } = await searchParams;

  return (
    <RouteModal>
      <ConnectPanel id={id} source={source} room={room} />
    </RouteModal>
  );
}
