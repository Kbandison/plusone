"use client";

import { useActionState, useId, useState } from "react";

import {
  COMMUNITY_LABELS,
  CONDITIONS_BY_COMMUNITY,
  CONDITION_LABELS,
  COPY,
  DRAFT_COPY,
  allowsUEqualsU,
  type Community,
} from "@plusone/config";

import { saveCommunity } from "./actions";
import { type CommunityState } from "./state";

const C = DRAFT_COPY.community;
const INITIAL: CommunityState = { error: null };

export function CommunityForm() {
  const [state, action, pending] = useActionState(saveCommunity, INITIAL);
  const [community, setCommunity] = useState<Community | null>(null);
  const uEqualsUId = useId();
  const uEqualsUHintId = useId();

  // The condition options depend on the community, and the pairing is the same
  // one the database enforces — CONDITIONS_BY_COMMUNITY is asserted against the
  // CHECK constraint by a unit test, so this cannot offer a choice the insert
  // would then refuse.
  const conditions = community ? CONDITIONS_BY_COMMUNITY[community] : [];

  return (
    <form action={action} className="mt-10 flex flex-col gap-10">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[15px]">{C.communityLabel}</legend>
        {(Object.keys(COMMUNITY_LABELS) as Community[]).map((value) => (
          <label
            key={value}
            className="ease-brand flex cursor-pointer items-center gap-3.5 rounded-lg border border-line-2 bg-surface px-4 py-3.5 text-[16px] transition-colors duration-200 has-checked:border-accent"
          >
            <input
              type="radio"
              name="community"
              value={value}
              required
              checked={community === value}
              onChange={() => setCommunity(value)}
              className="size-[18px] accent-accent"
            />
            {COMMUNITY_LABELS[value]}
          </label>
        ))}
      </fieldset>

      {/* Announced, because it appears. Choosing a community injects a whole
          second required question below, and a screen reader user arrowing
          through the first group had no idea anything had changed — they would
          reach Continue and be told the form was incomplete. */}
      {community ? (
        <fieldset role="group" aria-live="polite" className="flex flex-col gap-3">
          <legend className="mb-3 text-[15px]">{C.conditionLabel}</legend>
          {conditions.map((value) => (
            <label
              key={value}
              className="ease-brand flex cursor-pointer items-center gap-3.5 rounded-lg border border-line-2 bg-surface px-4 py-3.5 text-[16px] transition-colors duration-200 has-checked:border-accent"
            >
              <input
                type="radio"
                name="condition"
                value={value}
                required
                className="size-[18px] accent-accent"
              />
              {CONDITION_LABELS[value]}
            </label>
          ))}
        </fieldset>
      ) : null}

      {community && allowsUEqualsU(community) ? (
        <div className="flex items-start gap-3.5">
          <input
            id={uEqualsUId}
            name="u_equals_u"
            type="checkbox"
            aria-describedby={uEqualsUHintId}
            className="mt-[3px] size-[22px] shrink-0 accent-accent"
          />
          <div>
            <label htmlFor={uEqualsUId} className="text-[15.5px]">
              {C.uEqualsULabel}
            </label>
            <p id={uEqualsUHintId} className="mt-1.5 text-[13.5px] text-ink-3">
              {C.uEqualsUHint}
            </p>
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !community}
        className="ease-brand w-full rounded-lg bg-accent px-6 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995] disabled:opacity-55 sm:w-auto sm:min-w-[190px] sm:self-start"
      >
        {COPY.actions.continueLabel}
      </button>
    </form>
  );
}
