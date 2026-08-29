import { RADIUS } from "@plusone/config";

/**
 * The radii to offer, given the one already stored.
 *
 * A `<select>` whose value is not among its options does not error and does not
 * look wrong: the browser silently selects the first option instead. The
 * control then reads "5 miles" for a member whose alert is set to 110, and the
 * next save writes 5 — shrinking their alert without ever saying so.
 *
 * That is not hypothetical here. `activity_alerts.radius_mi` accepts any
 * integer from RADIUS.minMi to RADIUS.maxMi, the member holds `update
 * (radius_mi)` on their own row, and the obvious next change — seeding this
 * from `profiles.search_radius_mi`, which the onboarding slider writes as any
 * integer — turns a rare case into the normal one.
 *
 * So the stored value is always offered, even when the ladder does not carry
 * it. The alternative, snapping to the nearest rung, is the same silent edit
 * with a better bedside manner.
 *
 * Found by the WSL session on 2026-08-29 in the Browse distance filter, where
 * it had been latent since that filter existed; this is the same shape in a
 * different control, fixed before it could bite.
 */
export function alertRadiusOptions(selected: number): readonly number[] {
  // Widened deliberately: RADIUS is `as const`, so alertLadderMi is a tuple of
  // literal types and `.includes(number)` will not typecheck against it.
  const ladder: readonly number[] = RADIUS.alertLadderMi;
  if (ladder.includes(selected)) return ladder;
  if (!Number.isFinite(selected)) return ladder;
  return [...ladder, selected].sort((a, b) => a - b);
}
