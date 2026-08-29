"use client";

import { useRef } from "react";

import {
  DRAFT_COPY,
  DRINKING_TRAIT_LABELS,
  INTENTION_LABELS,
  KIDS_LABELS,
  KIDS_PLAN_LABELS,
  RADIUS,
  SMOKING_TRAIT_LABELS,
  type Intention,
} from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { ACTIVITY_WINDOWS, AGE_FLOOR, AGE_CEILING, type BrowseFilterState } from "./filter-state";

const C = DRAFT_COPY.app;

const field =
  "rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] focus:border-accent";
const legend = "flex flex-col gap-2 text-[11px] text-ink-2";

/**
 * The filters, applied when they are changed.
 *
 * They needed an Apply press, which is the only control left in the app that
 * asks a member to confirm a choice they have already made — the profile
 * stopped doing it, and a filter is a weaker commitment than a search radius.
 *
 * Still a plain GET form underneath, so every result is a URL a member can
 * bookmark or send. requestSubmit() rather than a router push: the form already
 * knows how to serialise itself into a query string, and reimplementing that in
 * JavaScript would be a second place for the parameter names to live.
 *
 * ── the deeper set (backlog server 16) ──────────────────────────────────────
 *
 * Three controls became eleven, and the extra eight are folded behind a
 * `<details>` rather than laid out flat. Two reasons, and neither is tidiness:
 * this grid is two columns on a phone and eleven controls above it would push
 * every face below the fold, and a wall of filters on a pool this size invites
 * a member to narrow it to nothing before they have seen anybody.
 *
 * The fold OPENS ITSELF when any of the eight is set. A bookmarked URL with
 * `?kids=none` in it must not render as a normal Browse page that happens to be
 * short — that is the failure where a member concludes the app is empty and the
 * reason is folded away one tap above them.
 *
 * All four lifestyle answers were already on every profile and read by nothing.
 */
export function BrowseFilters({
  state,
  advancedCount,
}: {
  state: BrowseFilterState;
  advancedCount: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const apply = () => form.current?.requestSubmit();

  return (
    <form ref={form} method="get" className="mt-8">
      <div className="flex flex-wrap items-end gap-4">
        <label className={legend}>
          {C.filterDistance}
          <select
            name="distance"
            defaultValue={String(state.distanceMi)}
            onChange={apply}
            className={field}
          >
            {RADIUS.ladderMi.map((mi) => (
              <option key={mi} value={mi}>
                {mi} miles
              </option>
            ))}
          </select>
        </label>

        <label className={legend}>
          {C.filterIntention}
          <select
            name="intention"
            defaultValue={state.intention ?? ""}
            onChange={apply}
            className={field}
          >
            <option value="">{C.filterAny}</option>
            {(Object.keys(INTENTION_LABELS) as Intention[]).map((value) => (
              <option key={value} value={value}>
                {INTENTION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        {/* Was a checkbox, and "active this week" is one bit for a question with
            obvious shades — somebody here this afternoon and somebody here last
            Sunday were the same answer. `?active=1` still means this week, so
            every URL anyone has bookmarked or sent still resolves. */}
        <label className={legend}>
          {C.filterActivity}
          <select
            name="activity"
            defaultValue={state.activity ?? ""}
            onChange={apply}
            className={field}
          >
            <option value="">{C.filterActivityAny}</option>
            {ACTIVITY_WINDOWS.map((window) => (
              <option key={window.id} value={window.id}>
                {window.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* open when something inside is on — see the header. */}
      <details open={advancedCount > 0} className="mt-4 border-t border-line-2 pt-4">
        <summary className="cursor-pointer text-[11.7px] text-ink-2 marker:text-ink-3">
          {C.filtersMoreLabel}
          {advancedCount > 0 ? (
            <span className="ml-2 text-ink-3">· {C.filtersActiveCount(advancedCount)}</span>
          ) : null}
        </summary>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Choice
            name="kids"
            label={C.filterKids}
            options={KIDS_LABELS}
            value={state.kids}
            onChange={apply}
          />
          <Choice
            name="kids_plan"
            label={C.filterKidsPlan}
            options={KIDS_PLAN_LABELS}
            value={state.kidsPlan}
            onChange={apply}
          />
          <Choice
            name="smokes"
            label={C.filterSmokes}
            options={SMOKING_TRAIT_LABELS}
            value={state.smokes}
            onChange={apply}
          />
          <Choice
            name="drinks"
            label={C.filterDrinks}
            options={DRINKING_TRAIT_LABELS}
            value={state.drinks}
            onChange={apply}
          />

          {/* Narrows what the mutual age wall already permitted; it cannot widen
              it. Both ends default to blank rather than to 18 and 99, so a
              member who never touches this is not silently filtering. */}
          <div className="flex items-end gap-2">
            <label className={legend}>
              {C.filterAgeFrom}
              <select
                name="age_min"
                defaultValue={state.ageMin ?? ""}
                onChange={apply}
                className={field}
              >
                <option value="">{C.filterAny}</option>
                {AGE_OPTIONS}
              </select>
            </label>
            <label className={legend}>
              <span className="sr-only">{C.filterAgeTo}</span>
              <span aria-hidden="true">{C.filterAgeTo}</span>
              <select
                name="age_max"
                defaultValue={state.ageMax ?? ""}
                onChange={apply}
                className={field}
              >
                <option value="">{C.filterAny}</option>
                {AGE_OPTIONS}
              </select>
            </label>
          </div>

          <label className="flex min-h-tap items-center gap-2.5 text-[11.7px]">
            <input
              type="checkbox"
              name="bio"
              value="1"
              defaultChecked={state.writtenOnly}
              onChange={apply}
              className="size-[14.6px] accent-accent"
            />
            {C.filterWritten}
          </label>
        </div>
      </details>

      {/* The only way through without JavaScript, and invisible with it. The
          selects above submit on change, so a button beside them is a second
          control for a decision already taken. */}
      <noscript>
        <button type="submit" className={buttonClass("secondary")}>
          {C.applyFiltersLabel}
        </button>
      </noscript>
    </form>
  );
}

/**
 * One labelled select over an enum's label map.
 *
 * Written out four times it was four places for "Any" to drift, and the label
 * maps are the same ones the onboarding form writes with — so a member reads
 * back the words they picked rather than a second translation of them.
 */
function Choice({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: Readonly<Record<string, string>>;
  value: string | null;
  onChange: () => void;
}) {
  return (
    <label className={legend}>
      {label}
      <select name={name} defaultValue={value ?? ""} onChange={onChange} className={field}>
        <option value="">{C.filterAny}</option>
        {Object.entries(options).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Built once at module scope — the same eighty-two options render twice. */
const AGE_OPTIONS = Array.from(
  { length: AGE_CEILING - AGE_FLOOR + 1 },
  (_, i) => AGE_FLOOR + i,
).map((age) => (
  <option key={age} value={age}>
    {age}
  </option>
));
