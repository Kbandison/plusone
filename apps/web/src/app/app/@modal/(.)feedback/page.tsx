import { RouteModal } from "@/app/route-modal";
import { FeedbackPanel } from "@/app/app/feedback/feedback-panel";

export const dynamic = "force-dynamic";

/**
 * Reporting a problem, over the problem.
 *
 * `(.)` intercepts the sibling `feedback` segment — @modal is a slot rather
 * than a route segment, so from here `feedback` is one level across and not one
 * level up. That covers every screen under the /app layout, which is the point:
 * the whole value of the header icon is that it does not take you away from
 * whatever you are trying to describe.
 *
 * Leaving the screen to report it is exactly the wrong shape. A member three
 * taps into a bug loses it to go and write about it, and comes back to the top
 * of wherever they were — which is also why `?from=` exists, and why it still
 * works here: the sheet is a soft navigation, so the parameter the header link
 * built is the screen underneath.
 *
 * A hard load still gets the full page, and the URL stays real either way.
 */
export default async function FeedbackModal({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <RouteModal>
      <FeedbackPanel from={from ?? ""} />
    </RouteModal>
  );
}
