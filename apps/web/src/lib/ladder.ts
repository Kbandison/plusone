/**
 * A select must be able to state the value it is given.
 *
 * A `<select>` whose `defaultValue` matches none of its options does not error,
 * does not warn and does not look wrong: the browser silently selects the first
 * option. So the control displays a value the member never chose, and the next
 * submit WRITES it. The symptom is a setting that quietly changes itself when
 * somebody edits something else on the same form.
 *
 * This is not hypothetical and it is not rare. Three places in this app offer a
 * short ladder over a column that accepts a wider range:
 *
 *   * The Browse radius filter offers [50, 100, 150, 250]; `search_radius_mi`
 *     is any integer from 5 to 250 and the onboarding slider writes any of
 *     them. Kevin's own radius is 110, so the filter rendered "50 miles"
 *     underneath a stat correctly reading "within 110 miles", and changing any
 *     other filter would have submitted 50 and shrunk his search. Found on a
 *     real device on 2026-08-29; the same shape was live in macOS's alert
 *     radius, where the member holds `update (radius_mi)` on their own row and
 *     could reach an off-ladder value through PostgREST today.
 *   * Height offers every 2cm and `profiles_height_range` allows every integer.
 *   * Weight offers every 2kg and `profiles_weight_range` allows every integer.
 *
 * The last two are only reachable by a crafted post right now, because the form
 * is the sole writer and offers only even values. That is exactly the argument
 * for fixing them anyway: the obvious next change — seeding a height from
 * anywhere else, widening the step, importing a profile — turns a rare case
 * into the normal one, and the failure is silent when it arrives.
 *
 * SORTED IN, not appended. A ladder reading 5, 10, 25, 50, 100, 250, 110 looks
 * broken even when it behaves correctly.
 *
 * Deliberately NOT snapping the stored value to the nearest rung, which was the
 * other option. Snapping is the same silent edit with better manners: the
 * member still ends up with a number they did not choose, and it still gets
 * written on the next save.
 */
export function withStoredValue(
  options: readonly number[],
  stored: number | null | undefined,
): number[] {
  if (stored == null || options.includes(stored)) return [...options];
  return [...options, stored].sort((a, b) => a - b);
}
