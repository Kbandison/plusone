"use client";

import { useActionState, useId, useState } from "react";

import {
  COPY,
  DRAFT_COPY,
  FREQUENCY_LABELS,
  GENDER_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
  RELATIONSHIP_STRUCTURE_LABELS,
  DIET_LABELS,
  PETS_LABELS,
  EDUCATION_LABELS,
  WORK_LABELS,
  LANGUAGE_LABELS,
  LANGUAGES_MAX,
  RELIGION_LABELS,
  POLITICS_LABELS,
  formatWeight,
  WEIGHT_MIN_KG,
  WEIGHT_MAX_KG,
  formatHeight,
  HEIGHT_MIN_CM,
  HEIGHT_MAX_CM,
} from "@plusone/config";

import { PREFERENCES_INITIAL, type PreferencesState } from "./state";
import { buttonClass } from "@/app/ui";
import { StepActions } from "@/app/onboarding/step-actions";
import { withStoredValue } from "@/lib/ladder";
import { profile } from "@plusone/logic";

const AGE_FLOOR = profile.MINIMUM_AGE;
const AGE_CEILING = profile.OLDEST_PREFERENCE;

const C = DRAFT_COPY.preferences;

/**
 * Every 2 cm from the floor to the ceiling.
 *
 * Not every centimetre: sixty options is a scroll, a hundred and twenty is a
 * chore, and nobody picking their own height off a list is distinguishing 178
 * from 179. The column still stores the exact number, so a range filter stays a
 * range.
 */
const HEIGHTS = Array.from(
  { length: Math.floor((HEIGHT_MAX_CM - HEIGHT_MIN_CM) / 2) + 1 },
  (_, i) => HEIGHT_MIN_CM + i * 2,
);

/**
 * Every 2 kg, for the reason HEIGHTS is every 2 cm.
 *
 * Both are a SHORTER list than the column accepts — profiles_height_range and
 * profiles_weight_range allow every integer — so both go through
 * withStoredValue. Only a crafted post can produce an odd value today, since
 * this form is the sole writer; it is guarded anyway because the obvious next
 * change makes the rare case normal and the failure is silent. See lib/ladder.ts.
 */
const WEIGHTS = Array.from(
  { length: Math.floor((WEIGHT_MAX_KG - WEIGHT_MIN_KG) / 2) + 1 },
  (_, i) => WEIGHT_MIN_KG + i * 2,
);

/** What the member already answered, so the step can be walked back into. */
export interface PreferencesDefaults {
  readonly gender: string | null;
  readonly seeking: readonly string[];
  readonly ageMin: number | null;
  readonly ageMax: number | null;
  readonly smokes: string | null;
  readonly drinks: string | null;
  readonly kids: string | null;
  readonly kidsPlan: string | null;
  /** The eight from 20260829000100. Only the profile editor renders these. */
  readonly heightCm?: number | null;
  readonly relationshipStructure?: string | null;
  readonly exercise?: string | null;
  readonly diet?: string | null;
  readonly pets?: string | null;
  readonly education?: string | null;
  readonly work?: string | null;
  readonly languages?: readonly string[];
  readonly weightKg?: number | null;
  readonly religion?: string | null;
  readonly politics?: string | null;
}

/** A row of radios where one may be chosen and none is also an answer. */
function Choice({
  name,
  legend,
  options,
  selected,
  optional = true,
}: {
  name: string;
  legend: string;
  options: Readonly<Record<string, string>>;
  selected: string | null;
  optional?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-[12.2px]">{legend}</legend>
      <div className="flex flex-wrap gap-2.5">
        {Object.entries(options).map(([value, label]) => (
          <label
            key={value}
            className="ease-brand flex min-h-tap cursor-pointer items-center gap-2.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[12.6px] transition-colors duration-200 has-checked:border-accent"
          >
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={selected === value}
              className="size-[13.8px] accent-accent"
            />
            {label}
          </label>
        ))}
        {/* Not-stated has to be reachable AFTER something was chosen, or the
            first tap on any of these is permanent for the life of the page. */}
        {optional ? (
          <label className="ease-brand flex min-h-tap cursor-pointer items-center gap-2.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[12.6px] text-ink-3 transition-colors duration-200 has-checked:border-accent has-checked:text-ink">
            <input
              type="radio"
              name={name}
              value=""
              defaultChecked={selected === null}
              className="size-[13.8px] accent-accent"
            />
            {C.skipLabel}
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}

/**
 * Used twice: once in onboarding, once in the profile editor.
 *
 * The action is passed in rather than imported, because the two differ only in
 * where they leave you — onboarding continues to the next step, the editor
 * stays put and says it saved. Everything else about the screen, including what
 * the rules are, has to be identical or the two drift.
 */
export function PreferencesForm({
  defaults,
  action: save,
  submitLabel = COPY.actions.continueLabel,
  savedMessage,
  scope = "core",
}: {
  defaults: PreferencesDefaults;
  action: (previous: PreferencesState, formData: FormData) => Promise<PreferencesState>;
  submitLabel?: string;
  savedMessage?: string;
  /**
   * "core" is onboarding, "full" is the profile editor.
   *
   * Backlog 17: the eight new answers must not lengthen onboarding, which is
   * nine steps already. A member who has met somebody has a reason to fill this
   * in; a member who has not is being asked eleven more questions before seeing
   * a single face.
   *
   * The hidden field below is not decoration — parsePreferences reads it to
   * decide whether to WRITE those columns at all. Without it a core post would
   * parse eight absent controls as eight cleared answers.
   */
  scope?: "core" | "full";
}) {
  const [state, action, pending] = useActionState(save, PREFERENCES_INITIAL);

  return (
    <form action={action} className="mt-10 flex flex-col gap-10">
      <input type="hidden" name="_scope" value={scope} />
      {/* The two that actually filter, first. A member who abandons halfway has
          still answered the ones that decide whether their Drop means anything. */}
      <Choice
        name="gender"
        legend={C.genderLabel}
        options={GENDER_LABELS}
        selected={defaults.gender}
        optional={false}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[12.2px]">{C.seekingLabel}</legend>
        <p className="mb-2 text-[11px] text-ink-3">{C.seekingHint}</p>
        <div className="flex flex-wrap gap-2.5">
          {Object.entries(GENDER_LABELS).map(([value, label]) => (
            <label
              key={value}
              className="ease-brand flex min-h-tap cursor-pointer items-center gap-2.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[12.6px] transition-colors duration-200 has-checked:border-accent"
            >
              <input
                type="checkbox"
                name="seeking"
                value={value}
                defaultChecked={defaults.seeking.includes(value)}
                className="size-[13.8px] accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <AgeRange from={defaults.ageMin} to={defaults.ageMax} />

      {/* Below a rule and named as being about the member, because they are.
          Read as filters they would be answered strategically instead of
          honestly, and none of them narrows anybody's Drop. */}
      <div className="flex flex-col gap-8 border-t border-line pt-10">
        <div>
          <h2 className="text-h3">{C.aboutHeading}</h2>
          <p className="mt-3 text-[11.7px] text-ink-3">{C.aboutHint}</p>
        </div>

        <Choice
          name="smokes"
          legend={C.smokesLabel}
          options={FREQUENCY_LABELS}
          selected={defaults.smokes}
        />
        <Choice
          name="drinks"
          legend={C.drinksLabel}
          options={FREQUENCY_LABELS}
          selected={defaults.drinks}
        />
        <Choice name="kids" legend={C.kidsLabel} options={KIDS_LABELS} selected={defaults.kids} />
        <Choice
          name="kids_plan"
          legend={C.kidsPlanLabel}
          options={KIDS_PLAN_LABELS}
          selected={defaults.kidsPlan}
        />

        {scope === "full" ? (
          <>
            <label className="flex flex-col gap-2 text-[12.2px]">
              {C.heightLabel}
              <select
                name="height_cm"
                defaultValue={defaults.heightCm != null ? String(defaults.heightCm) : ""}
                className="rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] focus:border-accent"
              >
                <option value="">{C.heightUnstated}</option>
                {withStoredValue(HEIGHTS, defaults.heightCm).map((cm) => (
                  <option key={cm} value={cm}>
                    {formatHeight(cm)} · {cm} cm
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-[12.2px]">
              {C.weightLabel}
              <select
                name="weight_kg"
                defaultValue={defaults.weightKg != null ? String(defaults.weightKg) : ""}
                className="rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] focus:border-accent"
              >
                <option value="">{C.heightUnstated}</option>
                {withStoredValue(WEIGHTS, defaults.weightKg).map((kg) => (
                  <option key={kg} value={kg}>
                    {formatWeight(kg)} · {kg} kg
                  </option>
                ))}
              </select>
            </label>

            <Choice
              name="relationship_structure"
              legend={C.relationshipLabel}
              options={RELATIONSHIP_STRUCTURE_LABELS}
              selected={defaults.relationshipStructure ?? null}
            />
            <Choice
              name="exercise"
              legend={C.exerciseLabel}
              options={FREQUENCY_LABELS}
              selected={defaults.exercise ?? null}
            />
            <Choice
              name="diet"
              legend={C.dietLabel}
              options={DIET_LABELS}
              selected={defaults.diet ?? null}
            />
            <Choice
              name="pets"
              legend={C.petsLabel}
              options={PETS_LABELS}
              selected={defaults.pets ?? null}
            />
            <Choice
              name="education"
              legend={C.educationLabel}
              options={EDUCATION_LABELS}
              selected={defaults.education ?? null}
            />
            <Choice
              name="work"
              legend={C.workLabel}
              options={WORK_LABELS}
              selected={defaults.work ?? null}
            />

            {/* Checkboxes rather than a multi-select, which is the same call
                `seeking` above already made — a native multi-select is close to
                unusable on a phone, and this is the longer of the two lists. */}
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-[12.2px]">{C.languagesLabel}</legend>
              <p className="mb-2 text-[11px] text-ink-3">{C.languagesHint(LANGUAGES_MAX)}</p>
              <div className="flex flex-wrap gap-2.5">
                {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className="ease-brand flex min-h-tap cursor-pointer items-center gap-2.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[12.6px] transition-colors duration-200 has-checked:border-accent"
                  >
                    <input
                      type="checkbox"
                      name="languages"
                      value={value}
                      defaultChecked={(defaults.languages ?? []).includes(value)}
                      className="size-[13.8px] accent-accent"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {/* Below the rest and behind their own sentence, because these two
                are the only fields on this form that are GDPR Article 9 special
                category data a member types in themselves. Every other Article
                9 field on this profile sits behind the consent screen and the
                community wall; these do not, and somebody should know that
                before answering rather than after. */}
            <div className="flex flex-col gap-8 border-t border-line-2 pt-8">
              <p className="text-[11.7px] text-ink-3">{C.beliefHint}</p>
              <Choice
                name="religion"
                legend={C.religionLabel}
                options={RELIGION_LABELS}
                selected={defaults.religion ?? null}
              />
              <Choice
                name="politics"
                legend={C.politicsLabel}
                options={POLITICS_LABELS}
                selected={defaults.politics ?? null}
              />
            </div>
          </>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}

      {/* The editor does not navigate anywhere, so without this a member presses
          Save and the page sits there looking exactly as it did. */}
      {!state.error && state.saved && savedMessage ? (
        <p role="status" className="text-[11.7px] text-ink-3">
          {savedMessage}
        </p>
      ) : null}

      <StepActions step="preferences">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[153.9px] sm:self-start")}
        >
          {submitLabel}
        </button>
      </StepActions>
    </form>
  );
}

/**
 * The age range, as one control with two ends.
 *
 * Two number boxes made the member do the comparing: nothing on screen said
 * these were the two ends of one thing, and nothing stopped them typing 40 in
 * the first and 25 in the second — which the CHECK then refused at the bottom
 * of a filled-in form.
 *
 * Two range inputs stacked on one track, which is the accessible way to build
 * this: a genuine double-thumb slider is a div with ARIA bolted on, whereas two
 * native sliders arrive already keyboard-operable, already announced, and
 * already understood by every assistive technology. They are clamped against
 * each other so the pair can never cross.
 */
function AgeRange({ from, to }: { from: number | null; to: number | null }) {
  // Clamped on the way in as well as on the way out: a row saved before the
  // ceiling came down to 80 still holds a larger number, and seeding the state
  // with it would put a thumb off the end of its own track.
  const clamp = (age: number) => Math.min(Math.max(age, AGE_FLOOR), AGE_CEILING);
  const [min, setMin] = useState(clamp(from ?? AGE_FLOOR));
  const [max, setMax] = useState(clamp(to ?? AGE_CEILING));
  const minId = useId();
  const maxId = useId();

  const span = AGE_CEILING - AGE_FLOOR;
  const left = ((min - AGE_FLOOR) / span) * 100;
  const right = ((max - AGE_FLOOR) / span) * 100;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[12.2px]">{C.ageLabel}</legend>
      <p className="text-[11px] text-ink-3">{C.ageHint}</p>

      <output className="mt-2 font-display text-h3 leading-none tabular-nums">
        {C.ageSpan(min, max)}
      </output>

      <div className="relative mt-4 h-tap">
        {/* The track and the chosen span, drawn once and shared by both thumbs.
            aria-hidden: the sliders themselves say all of this out loud. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-2"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${left}%`, right: `${100 - right}%` }}
        />

        <label htmlFor={minId} className="sr-only">
          {C.ageFrom}
        </label>
        <input
          id={minId}
          name="age_min"
          type="range"
          min={AGE_FLOOR}
          max={AGE_CEILING}
          value={min}
          aria-valuetext={C.ageFromValue(min)}
          // Clamped, so the two ends cannot cross and produce a range the CHECK
          // would refuse after the member had filled in everything else.
          onChange={(event) => setMin(Math.min(Number(event.target.value), max))}
          // Raised above the other slider once it is in the upper half of the
          // track, where the two thumbs can end up on top of each other and the
          // one underneath cannot be grabbed.
          style={{ zIndex: min > (AGE_FLOOR + AGE_CEILING) / 2 ? 4 : 2 }}
          className="range-overlay absolute inset-x-0 top-1/2 h-tap w-full -translate-y-1/2"
        />

        <label htmlFor={maxId} className="sr-only">
          {C.ageTo}
        </label>
        <input
          id={maxId}
          name="age_max"
          type="range"
          min={AGE_FLOOR}
          max={AGE_CEILING}
          value={max}
          aria-valuetext={C.ageToValue(max)}
          onChange={(event) => setMax(Math.max(Number(event.target.value), min))}
          style={{ zIndex: 3 }}
          className="range-overlay absolute inset-x-0 top-1/2 h-tap w-full -translate-y-1/2"
        />
      </div>
    </fieldset>
  );
}
