"use client";

import { useActionState, useId } from "react";

import {
  COPY,
  DRAFT_COPY,
  FREQUENCY_LABELS,
  GENDER_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
} from "@plusone/config";

import { savePreferences } from "./actions";
import { PREFERENCES_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

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
      <legend className="mb-3 text-[15px]">{legend}</legend>
      <div className="flex flex-wrap gap-2.5">
        {Object.entries(options).map(([value, label]) => (
          <label
            key={value}
            className="ease-brand flex min-h-tap cursor-pointer items-center gap-2.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[15.5px] transition-colors duration-200 has-checked:border-accent"
          >
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={selected === value}
              className="size-[17px] accent-accent"
            />
            {label}
          </label>
        ))}
        {/* Not-stated has to be reachable AFTER something was chosen, or the
            first tap on any of these is permanent for the life of the page. */}
        {optional ? (
          <label className="ease-brand flex min-h-tap cursor-pointer items-center gap-2.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[15.5px] text-ink-3 transition-colors duration-200 has-checked:border-accent has-checked:text-ink">
            <input
              type="radio"
              name={name}
              value=""
              defaultChecked={selected === null}
              className="size-[17px] accent-accent"
            />
            {C.skipLabel}
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}

export function PreferencesForm({ defaults }: { defaults: PreferencesDefaults }) {
  const [state, action, pending] = useActionState(savePreferences, PREFERENCES_INITIAL);
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
        <legend className="mb-1 text-[15px]">{C.seekingLabel}</legend>
        <p className="mb-2 text-[13.5px] text-ink-3">{C.seekingHint}</p>
        <div className="flex flex-wrap gap-2.5">
          {Object.entries(GENDER_LABELS).map(([value, label]) => (
            <label
              key={value}
              className="ease-brand flex min-h-tap cursor-pointer items-center gap-2.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[15.5px] transition-colors duration-200 has-checked:border-accent"
            >
              <input
                type="checkbox"
                name="seeking"
                value={value}
                defaultChecked={defaults.seeking.includes(value)}
                className="size-[17px] accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[15px]">{C.ageLabel}</legend>
        <p className="mb-2 text-[13.5px] text-ink-3">{C.ageHint}</p>
        <div className="flex items-end gap-4">
          <span className="flex flex-col gap-2">
            <label htmlFor={minId} className="text-[13.5px] text-ink-3">
              {C.ageFrom}
            </label>
            <input
              id={minId}
              name="age_min"
              type="number"
              inputMode="numeric"
              min={18}
              max={120}
              defaultValue={defaults.ageMin ?? ""}
              className="ease-brand w-[92px] rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] tabular-nums transition-colors duration-200 focus:border-accent"
            />
          </span>
          <span className="flex flex-col gap-2">
            <label htmlFor={maxId} className="text-[13.5px] text-ink-3">
              {C.ageTo}
            </label>
            <input
              id={maxId}
              name="age_max"
              type="number"
              inputMode="numeric"
              min={18}
              max={120}
              defaultValue={defaults.ageMax ?? ""}
              className="ease-brand w-[92px] rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] tabular-nums transition-colors duration-200 focus:border-accent"
            />
          </span>
        </div>
      </fieldset>

      {/* Below a rule and named as being about the member, because they are.
          Read as filters they would be answered strategically instead of
          honestly, and none of them narrows anybody's Drop. */}
      <div className="flex flex-col gap-8 border-t border-line pt-10">
        <div>
          <h2 className="text-h3">{C.aboutHeading}</h2>
          <p className="mt-3 text-[14.5px] text-ink-3">{C.aboutHint}</p>
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
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "w-full sm:w-auto sm:min-w-[190px] sm:self-start")}
      >
        {COPY.actions.continueLabel}
      </button>
    </form>
  );
}
