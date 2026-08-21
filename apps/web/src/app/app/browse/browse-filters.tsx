"use client";

import { useRef } from "react";

import { DRAFT_COPY, INTENTION_LABELS, RADIUS, type Intention } from "@plusone/config";

import { buttonClass } from "@/app/ui";

const C = DRAFT_COPY.app;

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
 */
export function BrowseFilters({
  distanceMi,
  intention,
  activeOnly,
}: {
  distanceMi: number;
  intention?: Intention | undefined;
  activeOnly: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const apply = () => form.current?.requestSubmit();

  return (
    <form ref={form} method="get" className="mt-8 flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-2 text-[11px] text-ink-2">
        {C.filterDistance}
        <select
          name="distance"
          defaultValue={String(distanceMi)}
          onChange={apply}
          className="rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] focus:border-accent"
        >
          {RADIUS.ladderMi.map((mi) => (
            <option key={mi} value={mi}>
              {mi} miles
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2 text-[11px] text-ink-2">
        {C.filterIntention}
        <select
          name="intention"
          defaultValue={intention ?? ""}
          onChange={apply}
          className="rounded-lg border border-line-control bg-surface px-3.5 py-2.5 text-[16px] focus:border-accent"
        >
          <option value="">{C.filterAny}</option>
          {(Object.keys(INTENTION_LABELS) as Intention[]).map((value) => (
            <option key={value} value={value}>
              {INTENTION_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-h-tap items-center gap-2.5 text-[11.7px]">
        <input
          type="checkbox"
          name="active"
          value="1"
          defaultChecked={activeOnly}
          onChange={apply}
          className="size-[14.6px] accent-accent"
        />
        {C.filterActive}
      </label>

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
