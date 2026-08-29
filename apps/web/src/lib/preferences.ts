import "server-only";

import {
  DIET_LABELS,
  DRAFT_COPY,
  EDUCATION_LABELS,
  FREQUENCY_LABELS,
  GENDER_LABELS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  POLITICS_LABELS,
  RELIGION_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
  LANGUAGES_MAX,
  LANGUAGE_LABELS,
  PETS_LABELS,
  RELATIONSHIP_STRUCTURE_LABELS,
  WORK_LABELS,
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
 * The eight from 20260829000100, which only the profile editor renders.
 *
 * Optional on the update, and that is the whole point — see PREFERENCE_SCOPES.
 */
export interface ExtendedPreferenceValues {
  readonly height_cm: number | null;
  readonly relationship_structure: string | null;
  readonly exercise: string | null;
  readonly diet: string | null;
  readonly pets: string | null;
  readonly education: string | null;
  readonly work: string | null;
  readonly languages: string[];
  readonly religion: string | null;
  readonly politics: string | null;
  readonly weight_kg: number | null;
}

/**
 * Which half of the form posted, declared by the form itself.
 *
 * The onboarding step and the profile editor are the SAME component, and
 * backlog 17 says the eight new answers must not lengthen onboarding — it is
 * nine steps already. So one caller renders them and the other does not.
 *
 * That is a data-loss bug waiting to happen, and it is silent. `formData.get`
 * returns null for a control that was never rendered, every one of these parses
 * null as "not stated", and the update writes it — so a member who set their
 * height on their profile and later walked back through onboarding would have
 * had it quietly erased, along with all eight. `languages` is worse: an
 * unchecked checkbox group posts nothing at all, which is indistinguishable
 * from a group that was never on the page.
 *
 * A hidden field naming the scope makes it explicit rather than inferred. The
 * absent case then means "this form does not own those columns" rather than
 * "the member cleared them", and the update simply omits the keys.
 */
/**
 * The eight columns that may not exist yet.
 *
 * Named once so the retry in updatePreferences cannot drift from the spread in
 * parsePreferences — a column in one list and not the other is a save that
 * fails forever with a message about nothing.
 */
export const EXTENDED_PREFERENCE_COLUMNS = [
  "height_cm",
  "weight_kg",
  "religion",
  "politics",
  "relationship_structure",
  "exercise",
  "diet",
  "pets",
  "education",
  "work",
  "languages",
] as const satisfies readonly (keyof ExtendedPreferenceValues)[];

export const PREFERENCE_SCOPES = ["core", "full"] as const;
export type PreferenceScope = (typeof PREFERENCE_SCOPES)[number];
export const SCOPE_FIELD = "_scope";

export function scopeOf(formData: FormData): PreferenceScope {
  const raw = formData.get(SCOPE_FIELD);
  return raw === "full" ? "full" : "core";
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
 * A height box: blank means not stated, and not stated is not zero.
 *
 * Same shape as ageOrNull, and separate from it because the bounds are a
 * different fact — profiles_height_range refuses anything outside them, and a
 * typo'd 17 or 700 would otherwise sit in a filter forever matching nobody.
 */
function boundedOrNull(
  value: FormDataEntryValue | null,
  min: number,
  max: number,
): number | null | "invalid" {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return null;
  if (!/^\d{2,3}$/.test(raw)) return "invalid";
  const n = Number(raw);
  if (n < min || n > max) return "invalid";
  return n;
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
): { values: PreferenceValues & Partial<ExtendedPreferenceValues> } | { error: string } {
  const scope = scopeOf(formData);
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

  const height =
    scope === "full"
      ? boundedOrNull(formData.get("height_cm"), HEIGHT_MIN_CM, HEIGHT_MAX_CM)
      : null;
  if (height === "invalid") return { error: E.height };

  const weight =
    scope === "full"
      ? boundedOrNull(formData.get("weight_kg"), WEIGHT_MIN_KG, WEIGHT_MAX_KG)
      : null;
  if (weight === "invalid") return { error: E.weight };

  // Deduplicated and capped, because profiles_languages_count refuses more than
  // eight and a rejected update at the end of a filled-in form says nothing
  // useful to the member. Truncating rather than erroring: the form does not
  // offer a ninth, so anything past it is a crafted post rather than a mistake
  // somebody made.
  const languages = [
    ...new Set(
      formData
        .getAll("languages")
        .filter((value): value is string => typeof value === "string")
        .filter((value) => value in LANGUAGE_LABELS),
    ),
  ].slice(0, LANGUAGES_MAX);

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
      // Spread rather than set to null, so the keys are ABSENT from the update
      // on a core post. A null here would be a write.
      ...(scope === "full"
        ? {
            height_cm: height,
            relationship_structure: oneOf(
              formData.get("relationship_structure"),
              RELATIONSHIP_STRUCTURE_LABELS,
            ),
            // The same enum smoking and drinking use, deliberately —
            // 20260818000100 made lifestyle_frequency shared so there would not
            // be three identical enums nobody could tell apart.
            exercise: oneOf(formData.get("exercise"), FREQUENCY_LABELS),
            diet: oneOf(formData.get("diet"), DIET_LABELS),
            pets: oneOf(formData.get("pets"), PETS_LABELS),
            education: oneOf(formData.get("education"), EDUCATION_LABELS),
            work: oneOf(formData.get("work"), WORK_LABELS),
            languages,
            weight_kg: weight,
            // Article 9 special category, both of them. Read exactly like every
            // other optional field here — an unrecognised value becomes null —
            // but note that `prefer_not_to_say` is a REAL enum value and is not
            // this branch: declining is an answer a member chose, and null is
            // nobody having asked.
            religion: oneOf(formData.get("religion"), RELIGION_LABELS),
            politics: oneOf(formData.get("politics"), POLITICS_LABELS),
          }
        : {}),
    },
  };
}
