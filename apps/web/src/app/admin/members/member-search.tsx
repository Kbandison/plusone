"use client";

import { useActionState } from "react";

import { RevealCondition } from "./reveal";
import { lookupMembers } from "./actions";
import { LOOKUP_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

/**
 * The search box and its results.
 *
 * A client component so the query never becomes a URL — see the note on
 * lookupMembers. The results live in action state instead.
 */
export function MemberSearch() {
  const [state, act, pending] = useActionState(lookupMembers, LOOKUP_INITIAL);

  return (
    <>
      <form action={act} className="mt-8 flex flex-wrap gap-3">
        <input
          name="q"
          type="search"
          minLength={2}
          placeholder="Display name or member id"
          aria-label="Display name or member id"
          className="min-w-[240px] flex-1 rounded-lg border border-line-control bg-surface px-4 py-2.5 text-[16px] focus:border-accent"
        />
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          Look up
        </button>
      </form>

      {/* Announced: the results replace themselves in place, and a moderator
          who tabbed away has no other signal that the search finished. */}
      <p role="status" className="mt-10 text-[16px] text-ink-2">
        {state.searched && state.hits.length === 0 ? "Nobody matches that." : ""}
      </p>

      {state.hits.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-5">
          {state.hits.map((hit) => (
            <li key={hit.user_id} className="rounded-xl border border-line-2 bg-surface p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[1.15rem]">{hit.display_name ?? "No name"}</h2>
                <span className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">
                  {hit.verification_status}
                </span>
              </div>

              <p className="mt-2 text-[14px] text-ink-3">
                Joined {new Date(hit.created_at).toLocaleDateString()}
                {Number(hit.open_reports) > 0
                  ? ` · ${hit.open_reports} open report${Number(hit.open_reports) === 1 ? "" : "s"}`
                  : ""}
              </p>

              <RevealCondition memberId={hit.user_id} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
