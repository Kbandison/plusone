"use client";

import { useActionState, useState } from "react";

import { buttonClass } from "@/app/ui";
import { deleteNewsItem, updateNewsItem } from "./actions";
import { NEWS_INITIAL } from "./state";

export interface NewsRow {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly summary: string | null;
  readonly source_name: string;
  readonly community_scope: string;
  readonly published_at: string | null;
}

const SCOPES = ["all", "hsv", "hiv"] as const;

/**
 * One item: what it says, where it came from, and the two things an admin can
 * do about it.
 *
 * Items publish on arrival, so this screen is the only place one comes back
 * off. The edit form is collapsed because the common action here is reading
 * the list and occasionally removing something, not rewriting headlines.
 */
export function NewsItemRow({ item }: { item: NewsRow }) {
  const [open, setOpen] = useState(false);
  const [saveState, save, saving] = useActionState(updateNewsItem, NEWS_INITIAL);
  const [removeState, remove, removing] = useActionState(deleteNewsItem, NEWS_INITIAL);

  return (
    <li className="border-b border-line py-4 last:border-0">
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
        <span>{item.source_name}</span>
        <span className="rounded-full border border-line-2 px-2 py-0.5">
          {item.community_scope}
        </span>
        {item.published_at ? (
          <time dateTime={item.published_at}>
            {new Date(item.published_at).toLocaleDateString()}
          </time>
        ) : null}
      </p>

      <a
        href={item.url}
        target="_blank"
        // Same reason as everywhere else an outside link exists here: the
        // destination does not need to be told where the reader came from.
        rel="noopener noreferrer"
        className="ease-brand mt-1 block text-[14px] leading-[1.4] underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
      >
        {item.title}
      </a>

      {item.summary ? (
        <p className="mt-1.5 text-[12px] leading-[1.5] text-ink-2">{item.summary}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="ease-brand text-[11.7px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
        >
          Edit
        </button>

        <form action={remove}>
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            disabled={removing}
            className="ease-brand text-[11.7px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-critical disabled:opacity-55"
          >
            Delete
          </button>
        </form>

        {saveState.message || removeState.message ? (
          <span role="status" className="text-[11px] text-positive">
            {saveState.message ?? removeState.message}
          </span>
        ) : null}
        {saveState.error || removeState.error ? (
          <span role="alert" className="text-[11px] text-critical">
            {saveState.error ?? removeState.error}
          </span>
        ) : null}
      </div>

      {open ? (
        <form action={save} className="mt-4 flex flex-col gap-3 rounded-lg bg-surface p-4">
          <input type="hidden" name="id" value={item.id} />

          <label className="flex flex-col gap-1.5 text-[11px] text-ink-2">
            Title
            <input
              name="title"
              defaultValue={item.title}
              maxLength={300}
              className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px] text-ink-2">
            Summary
            <textarea
              name="summary"
              defaultValue={item.summary ?? ""}
              rows={3}
              maxLength={1000}
              className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px] text-ink-2">
            {/* Editable because the ingest guesses this from the source, and a
                source that mostly serves one community will sometimes publish
                for everybody. */}
            Community
            <select
              name="scope"
              defaultValue={item.community_scope}
              className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
            >
              {SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={saving} className={buttonClass("primary", "self-start")}>
            Save
          </button>
        </form>
      ) : null}
    </li>
  );
}
