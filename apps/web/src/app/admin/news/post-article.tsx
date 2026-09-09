"use client";

import { useActionState } from "react";

import { Field } from "@/app/auth-fields";
import { buttonClass, Card } from "@/app/ui";

import { postArticle } from "./actions";
import { NEWS_INITIAL, type NewsState } from "./state";

export interface NewsRoomOption {
  readonly id: string;
  readonly title: string;
  readonly community_scope: string;
}

/**
 * Posting an article by hand.
 *
 * ── why this exists, measured rather than assumed ──────────────────────────
 *
 * Across every live feed found on 2026-09-09: NINE articles on offer about
 * herpes, a hundred and twelve about HIV. No source list closes that — nothing
 * publishes for people with HSV the way TheBody publishes for people with HIV.
 * And the publishers that do exist for HSV, along with POZ and aidsmap, refuse
 * a non-browser agent. A person can read all of them.
 *
 * ── it is the ingest's shape, not a second kind of post ────────────────────
 *
 * `article_url` is what makes a room_message an article, and every surface
 * already renders one. This writes the same columns the cron writes and
 * conflicts on the same key, so posting something the feed later picks up is a
 * no-op rather than a duplicate.
 *
 * ── both rooms are offered, and neither is default ─────────────────────────
 *
 * The scope decision is the one thing a person is here to make and the one the
 * ingest keeps getting wrong on its own — ScienceDaily files tuberculosis under
 * herpes. Nothing is preselected, so an article cannot reach a community
 * because a checkbox was already ticked.
 */
export function PostArticle({ rooms }: { rooms: readonly NewsRoomOption[] }) {
  const [state, action, pending] = useActionState<NewsState, FormData>(postArticle, NEWS_INITIAL);

  return (
    <Card className="mt-8">
      <h2 className="text-[0.891rem] tracking-[0.04em] text-ink-3 uppercase">Post an article</h2>
      <p className="mt-3 max-w-[54ch] text-[12px] leading-[1.7] text-ink-2">
        For anything the ingest cannot reach — most HSV publishers, POZ and aidsmap all refuse a
        robot — and for the weeks when there simply is not much. It lands looking exactly like a
        gathered one.
      </p>

      <form action={action} className="mt-5 flex flex-col gap-4">
        <Field id="url" name="url" label="Link" type="url" required placeholder="https://" />
        <Field id="title" name="title" label="Headline" required />
        <Field id="source" name="source" label="Source" required placeholder="POZ" />
        <Field
          id="summary"
          name="summary"
          label="Summary"
          placeholder="Optional — the headline is used if this is empty"
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12.2px]">Post it to</legend>
          {/* Unticked on purpose — see the note above the component. */}
          {rooms.map((room) => (
            <label key={room.id} className="min-h-tap flex items-center gap-3 text-[12.6px]">
              <input
                type="checkbox"
                name="roomId"
                value={room.id}
                className="size-5 shrink-0 accent-accent"
              />
              <span className="flex-1">{room.title}</span>
              <span className="rounded-full border border-line-2 px-2 py-0.5 text-[10.5px] text-ink-3">
                {room.community_scope}
              </span>
            </label>
          ))}
          {rooms.length === 0 ? (
            <p className="text-[11.7px] text-ink-3">No Latest news rooms found.</p>
          ) : null}
        </fieldset>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
            {pending ? "Posting…" : "Post"}
          </button>
          {state.message ? (
            <span className="text-[12px] text-positive">{state.message}</span>
          ) : null}
          {state.error ? <span className="text-[12px] text-danger">{state.error}</span> : null}
        </div>
      </form>
    </Card>
  );
}
