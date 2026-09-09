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
