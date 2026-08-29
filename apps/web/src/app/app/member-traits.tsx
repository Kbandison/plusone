import {
  DIET_LABELS,
  DRINKING_TRAIT_LABELS,
  EDUCATION_LABELS,
  EXERCISE_TRAIT_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
  LANGUAGE_LABELS,
  PETS_LABELS,
  POLITICS_LABELS,
  RELATIONSHIP_STRUCTURE_LABELS,
  RELIGION_LABELS,
  SMOKING_TRAIT_LABELS,
  WORK_LABELS,
  formatHeight,
} from "@plusone/config";

/**
 * The four things every member answers and nobody has ever been shown.
 *
 * Smoking, drinking, kids and feelings about kids have been asked in onboarding
 * and editable on the profile since 20260818000100, and they reached no screen:
 * `visible_profiles` carries all four, `matched_profiles` passes them through
 * with `select v.*`, and then every surface dropped them. Four questions a
 * member answers on the way in that changed nothing they or anyone else could
 * see.
 *
 * One component because there are two callers — the Browse card and the connect
 * panel — and a trait rendered two ways is a trait that will eventually be
 * labelled two ways.
 *
 * Nothing here is health data. Condition and U=U pass through the same view and
 * are deliberately absent — held for a decision 2026-08-29, and the reason they
 * are not simply two more chips is that they are the only attributes on this
 * profile a person did not choose.
 */
export interface MemberTraits {
  readonly smokes?: string | null | undefined;
  readonly drinks?: string | null | undefined;
  readonly kids?: string | null | undefined;
  readonly kids_plan?: string | null | undefined;
  readonly height_cm?: number | null | undefined;
  readonly weight_kg?: number | null | undefined;
  readonly relationship_structure?: string | null | undefined;
  readonly exercise?: string | null | undefined;
  readonly diet?: string | null | undefined;
  readonly pets?: string | null | undefined;
  readonly education?: string | null | undefined;
  readonly work?: string | null | undefined;
  readonly languages?: readonly string[] | null | undefined;
  readonly religion?: string | null | undefined;
  readonly politics?: string | null | undefined;
}

const label = (map: Record<string, string>, value: string | null | undefined) =>
  value != null && value in map ? (map[value] as string) : null;

/**
 * The traits a member has actually stated, in a fixed order.
 *
 * Unstated is NOT rendered as "prefers not to say". An empty answer here means
 * nobody asked at a moment they were willing to answer, and a row of absences
 * turns a profile that is merely new into one that reads as evasive.
 *
 * Kids first because it is the one people filter on hardest, and the card only
 * has room for two.
 */
export function traitList(member: MemberTraits): { key: string; text: string }[] {
  const entries = [
    {
      key: "relationship",
      text: label(RELATIONSHIP_STRUCTURE_LABELS, member.relationship_structure),
    },
    { key: "kids", text: label(KIDS_LABELS, member.kids) },
    { key: "kids_plan", text: label(KIDS_PLAN_LABELS, member.kids_plan) },
    { key: "height", text: member.height_cm != null ? formatHeight(member.height_cm) : null },
    { key: "work", text: label(WORK_LABELS, member.work) },
    { key: "education", text: label(EDUCATION_LABELS, member.education) },
    { key: "languages", text: languageText(member.languages) },
    { key: "exercise", text: label(EXERCISE_TRAIT_LABELS, member.exercise) },
    { key: "diet", text: label(DIET_LABELS, member.diet) },
    { key: "pets", text: label(PETS_LABELS, member.pets) },
    { key: "smokes", text: label(SMOKING_TRAIT_LABELS, member.smokes) },
    { key: "drinks", text: label(DRINKING_TRAIT_LABELS, member.drinks) },
    { key: "religion", text: label(RELIGION_LABELS, member.religion) },
    { key: "politics", text: label(POLITICS_LABELS, member.politics) },
  ];
  return entries.filter((t): t is { key: string; text: string } => t.text != null);
}

/**
 * Weight is filterable and is NOT a chip.
 *
 * It is in `MemberTraits` because Browse selects it for the filter, and it is
 * deliberately absent from this list. A number a member can search on is one
 * thing; the same number printed under somebody's face beside "Vegan" and "Dog
 * person" is another, and on an app whose pool is defined by a diagnosis — where
 * weight tracks treatment history closely enough to stand in for it — the
 * second is a cost with no matching benefit. Kevin asked for the filter.
 *
 * Delete this comment along with the decision if it is ever revisited; do not
 * add the chip and leave the comment.
 */

/** "English and Spanish", or "English +2" past what a chip can hold. */
function languageText(languages: readonly string[] | null | undefined): string | null {
  const named = (languages ?? [])
    .map((code) =>
      code in LANGUAGE_LABELS ? (LANGUAGE_LABELS as Record<string, string>)[code] : null,
    )
    .filter((name): name is string => name != null);
  if (named.length === 0) return null;
  if (named.length === 1) return named[0] as string;
  if (named.length === 2) return `${named[0]} and ${named[1]}`;
  return `${named[0]} +${named.length - 1}`;
}

/**
 * The chips, at card density.
 *
 * `max` exists because the Browse grid is two columns at every width and four
 * chips wrap to three lines there, which pushes the prompt — the thing a member
 * actually replies to — off the bottom of the card. The connect panel passes no
 * max and shows the lot.
 */
export function MemberTraitChips({
  member,
  max,
  className = "",
}: {
  member: MemberTraits;
  max?: number | undefined;
  className?: string;
}) {
  const traits = traitList(member);
  if (traits.length === 0) return null;
  const shown = max == null ? traits : traits.slice(0, max);
  // traitList is in priority order, so a card showing two shows the two that
  // say most about somebody rather than the two that happen to be filled in.

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map((trait) => (
        <li
          key={trait.key}
          className="rounded-full border border-line-2 px-2 py-0.5 text-[10.5px] text-ink-2"
        >
          {trait.text}
        </li>
      ))}
    </ul>
  );
}
