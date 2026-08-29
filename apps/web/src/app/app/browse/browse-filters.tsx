"use client";

import { useRef } from "react";

import { DRAFT_COPY, RADIUS } from "@plusone/config";

import { buttonClass } from "@/app/ui";
import {
  ACTIVITY_WINDOWS,
  ENUM_FILTERS,
  RANGE_FILTERS,
  type BrowseFilterState,
  type EnumFilter,
  type RangeFilter,
} from "./filter-state";

const C = DRAFT_COPY.app;

const FIELD =
  "rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] focus:border-accent";
const LABEL = "flex flex-col gap-2 text-[11px] text-ink-2";

/** The folded groups, in order, with the heading each gets. */
const GROUPS = [
  { id: "life", heading: C.filterGroupLife },
  { id: "body", heading: C.filterGroupBody },
  { id: "habits", heading: C.filterGroupHabits },
  { id: "background", heading: C.filterGroupBackground },
  { id: "belief", heading: C.filterGroupBelief },
] as const;

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
 * ── nineteen controls, and why most of them are folded and grouped ──────────
 *
 * Three became eleven became nineteen. The four not folded are the ones that
 * describe a search rather than a person — how far, what for, how recently,
 * how old — and they are the four somebody actually opens this page to set.
 *
 * The rest are behind a `<details>` and broken into named groups. Two reasons,
 * and neither is tidiness: this grid is two columns on a phone, so nineteen
 * controls above it would push every face below the fold; and a flat wall of
 * them invites a member to narrow a pool this size to nothing before they have
 * seen anybody. The match count beside the summary is the other half of that —
 * it says what the filters cost while they are still one tap from being undone.
 *
 * The fold OPENS ITSELF when any of them is set. A bookmarked URL with
 * `?kids=none` must not render as a normal Browse page that happens to be
 * short — that is the failure where a member concludes the app is empty and the
 * reason is folded away one tap above them.
 */
export function BrowseFilters({
  state,
  advancedCount,
  matching,
  shown,
}: {
  state: BrowseFilterState;
  advancedCount: number;
  matching: number;
  shown: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const apply = () => form.current?.requestSubmit();

  const top = ENUM_FILTERS.filter((f) => f.group === "top");
  const topRanges = RANGE_FILTERS.filter((r) => r.group === "top");

  return (
    <form ref={form} method="get" className="mt-8">
      <div className="flex flex-wrap items-end gap-4">
        {/* The member's own radius is an option even when it is off the ladder.
            
            RADIUS.ladderMi is [50, 100, 150, 250] and the onboarding slider
            writes any integer from 5 to 250 — so a member on 110 had a select
            whose value matched no option, and a browser falls back to the first
            one. It RENDERED "50 miles" while the stat above it correctly said
            110, and the next change to any other control submitted distance=50
            and silently shrank their search.
            
            Latent since this filter existed and nearly harmless at three
            controls; there are nineteen now, and every one of them submits this
            form. The ladder is still what is OFFERED — this only adds the value
            they already have, so the select can state it. */}
        <label className={LABEL}>
          {C.filterDistance}
          <select
            name="distance"
            defaultValue={String(state.distanceMi)}
            onChange={apply}
            className={FIELD}
          >
            {/* Widened to number[] because ladderMi is a readonly tuple of its
                four literal values, and the member's radius is any integer. */}
            {((RADIUS.ladderMi as readonly number[]).includes(state.distanceMi)
              ? [...RADIUS.ladderMi]
              : [...RADIUS.ladderMi, state.distanceMi].sort((a, b) => a - b)
            ).map((mi) => (
              <option key={mi} value={mi}>
                {mi} miles
              </option>
            ))}
          </select>
        </label>

        {top.map((filter) => (
          <EnumSelect key={filter.param} filter={filter} state={state} onChange={apply} />
        ))}

        {/* Was a checkbox, and "active this week" is one bit for a question with
            obvious shades — somebody here this afternoon and somebody here last
            Sunday were the same answer. `?active=1` still means this week, so
            every URL anyone has bookmarked or sent still resolves. */}
        <label className={LABEL}>
          {C.filterActivity}
          <select
            name="activity"
            defaultValue={state.activity ?? ""}
            onChange={apply}
            className={FIELD}
          >
            <option value="">{C.filterActivityAny}</option>
            {ACTIVITY_WINDOWS.map((window) => (
              <option key={window.id} value={window.id}>
                {window.label}
              </option>
            ))}
          </select>
        </label>

        {topRanges.map((range) => (
          <Range key={range.key} range={range} state={state} onChange={apply} />
        ))}
      </div>

      <details open={advancedCount > 0} className="mt-4 border-t border-line-2 pt-4">
        <summary className="cursor-pointer text-[11.7px] text-ink-2 marker:text-ink-3">
          {C.filtersMoreLabel}
          {advancedCount > 0 ? (
            <span className="ml-2 text-ink-3">· {C.filtersActiveCount(advancedCount)}</span>
          ) : null}
        </summary>

        {GROUPS.map((group) => {
          const enums = ENUM_FILTERS.filter((f) => f.group === group.id);
          const ranges = RANGE_FILTERS.filter((r) => r.group === group.id);
          if (enums.length === 0 && ranges.length === 0) return null;

          return (
            <fieldset key={group.id} className="mt-6">
              <legend className="mb-3 text-[10px] tracking-[0.02em] text-ink-3 uppercase">
                {group.heading}
              </legend>
              <div className="flex flex-wrap items-end gap-4">
                {enums.map((filter) => (
                  <EnumSelect key={filter.param} filter={filter} state={state} onChange={apply} />
                ))}
                {ranges.map((range) => (
                  <Range key={range.key} range={range} state={state} onChange={apply} />
                ))}
              </div>
            </fieldset>
          );
        })}

        <label className="mt-6 flex min-h-tap items-center gap-2.5 text-[11.7px]">
          <input
            type="checkbox"
            name="written"
            value="1"
            defaultChecked={state.writtenOnly}
            onChange={apply}
            className="size-[14.6px] accent-accent"
          />
          {C.filterWritten}
        </label>
      </details>

      {/* What the filters cost, while they are still one tap from being undone.
          Deliberately NOT the stat at the top of the page: that one describes
          the area and ignores every filter, and a member needs both to tell
          "nobody is near me" from "I have asked for too much". */}
      <p className="mt-4 text-[11px] text-ink-3">{C.filterMatchCount(shown, matching)}</p>

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
 * Reads ENUM_FILTERS rather than being written out fourteen times — see the
 * header of filter-state.ts. Fourteen hand-written copies is fourteen chances
 * to validate a value against the wrong map, and the symptom of getting that
 * wrong is a filter that silently matches nobody.
 */
function EnumSelect({
  filter,
  state,
  onChange,
}: {
  filter: EnumFilter;
  state: BrowseFilterState;
  onChange: () => void;
}) {
  return (
    <label className={LABEL}>
      {filter.label}
      <select
        name={filter.param}
        defaultValue={state.enums[filter.param] ?? ""}
        onChange={onChange}
        className={FIELD}
      >
        <option value="">{C.filterAny}</option>
        {Object.entries(filter.options).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A from/to pair over a numeric column.
 *
 * Both ends default to blank rather than to the bounds, so a member who never
 * touches this is not silently filtering — and a range narrows what the mutual
 * wall already permitted rather than widening it.
 */
function Range({
  range,
  state,
  onChange,
}: {
  range: RangeFilter;
  state: BrowseFilterState;
  onChange: () => void;
}) {
  const current = state.ranges[range.key];
  const options = [];
  for (let value = range.min; value <= range.max; value += 1) options.push(value);

  return (
    <div className="flex items-end gap-2">
      <label className={LABEL}>
        {range.fromLabel}
        <select
          name={`${range.key}_min`}
          defaultValue={current?.min != null ? String(current.min) : ""}
          onChange={onChange}
          className={FIELD}
        >
          <option value="">{C.filterAny}</option>
          {options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        {range.toLabel}
        <select
          name={`${range.key}_max`}
          defaultValue={current?.max != null ? String(current.max) : ""}
          onChange={onChange}
          className={FIELD}
        >
          <option value="">{C.filterAny}</option>
          {options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
