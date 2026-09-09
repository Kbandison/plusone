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
 * Nothing, which is the point.
 *
 * A slot with no default renders a 404 when it cannot match the URL — so
 * without this file, every hard load of a room would fail rather than simply
 * showing no modal.
 */
export default function NoModal() {
  return null;
}
