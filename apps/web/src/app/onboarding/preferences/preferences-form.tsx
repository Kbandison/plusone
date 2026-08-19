"use client";

import { useActionState, useId, useState } from "react";

import {
  COPY,
  DRAFT_COPY,
  FREQUENCY_LABELS,
  GENDER_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
} from "@plusone/config";

import { PREFERENCES_INITIAL, type PreferencesState } from "./state";
import { buttonClass } from "@/app/ui";
import { StepActions } from "@/app/onboarding/step-actions";
import { profile } from "@plusone/logic";

const AGE_FLOOR = profile.MINIMUM_AGE;
const AGE_CEILING = profile.OLDEST_PREFERENCE;

const C = DRAFT_COPY.preferences;

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
}: {
  defaults: PreferencesDefaults;
  action: (previous: PreferencesState, formData: FormData) => Promise<PreferencesState>;
  submitLabel?: string;
  savedMessage?: string;
}) {
  const [state, action, pending] = useActionState(save, PREFERENCES_INITIAL);
  const minId = useId();
  const maxId = useId();

  return (
    <form action={action} className="mt-10 flex flex-col gap-10">
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
