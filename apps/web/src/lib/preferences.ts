import "server-only";

import {
  DRAFT_COPY,
  FREQUENCY_LABELS,
  GENDER_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
} from "@plusone/config";
import { profile } from "@plusone/logic";

const E = DRAFT_COPY.preferences.errors;

/**
 * One definition of each end, shared with the slider.
 *
 * They were literals here, in a server-only module, so the Client Component
 * that draws the range could not see them — and a second copy of "18" is a
 * second thing to forget when the CHECK moves.
 */
export const AGE_FLOOR = profile.MINIMUM_AGE;
export const AGE_CEILING = profile.OLDEST_PREFERENCE;

/** The columns this form owns, ready for an update. */
export interface PreferenceValues {
  readonly gender: string;
  readonly seeking: string[];
  readonly age_min: number | null;
  readonly age_max: number | null;
  readonly smokes: string | null;
  readonly drinks: string | null;
  readonly kids: string | null;
  readonly kids_plan: string | null;
}

/**
 * One value, but only if it is one the enum actually holds.
 *
 * The form posts strings. A value the database does not know is a failed update
 * at the end of a filled-in form with nothing useful said to the member, so
 * anything unrecognised becomes null — "not stated", which is a legal answer
 * for every field except gender.
 */
function oneOf<T extends string>(
  value: FormDataEntryValue | null,
  allowed: Readonly<Record<T, string>>,
): T | null {
  const raw = typeof value === "string" ? value : "";
  return raw in allowed ? (raw as T) : null;
}

/** An age box: blank means no preference, and no preference is not zero. */
function ageOrNull(value: FormDataEntryValue | null): number | null | "invalid" {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return null;
  if (!/^\d{1,3}$/.test(raw)) return "invalid";
  const age = Number(raw);
  if (age < AGE_FLOOR || age > AGE_CEILING) return "invalid";
  return age;
}

/**
 * Reads the preferences form, or says why it cannot.
 *
 * Shared by onboarding and by the profile editor. Two copies of this would be
 * two sets of rules about who a member can see, and only one of them would ever
 * get the next fix.
 */
export function parsePreferences(
  formData: FormData,
): { values: PreferenceValues } | { error: string } {
  const gender = oneOf(formData.get("gender"), GENDER_LABELS);
  // Required, and not for tidiness: `gender` is the value everybody ELSE's
  // `seeking` is matched against, so a member without one is invisible to
  // every member who stated a preference.
  if (!gender) return { error: E.genderRequired };

  // Nothing chosen is "everyone", which is how the mutual filter reads an empty
  // array — not "nobody", which would be a Drop of zero.
  const seeking = formData
    .getAll("seeking")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => value in GENDER_LABELS);

  const ageMin = ageOrNull(formData.get("age_min"));
  const ageMax = ageOrNull(formData.get("age_max"));
  if (ageMin === "invalid" || ageMax === "invalid") return { error: E.ageRange };
  // The CHECK refuses this too. Caught here so it reaches the member as a
  // sentence about the two boxes rather than as a save that silently failed.
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) return { error: E.ageOrder };

  return {
    values: {
      gender,
      seeking: [...new Set(seeking)],
      age_min: ageMin,
      age_max: ageMax,
      smokes: oneOf(formData.get("smokes"), FREQUENCY_LABELS),
      drinks: oneOf(formData.get("drinks"), FREQUENCY_LABELS),
      kids: oneOf(formData.get("kids"), KIDS_LABELS),
      kids_plan: oneOf(formData.get("kids_plan"), KIDS_PLAN_LABELS),
    },
  };
}
