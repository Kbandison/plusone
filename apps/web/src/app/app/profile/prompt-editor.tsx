"use client";

import { useActionState, useState } from "react";

import {
  DRAFT_COPY,
  MAX_PROMPTS,
  PROFILE_PROMPTS,
  PROMPT_ANSWER_MAX_CHARS,
  type ProfilePromptAnswer,
} from "@plusone/config";

import { PROFILE_INITIAL, savePrompts } from "./actions";

const C = DRAFT_COPY.app;

/**
 * Answering prompts (Decision #14).
 *
 * These are the only way another member can reach you: a connect is a reply to
 * one of them. A member with none cannot receive connects at all, so the empty
 * state says that plainly rather than letting them wonder why it is quiet.
 */
export function PromptEditor({ answers }: { answers: readonly ProfilePromptAnswer[] }) {
  const [state, act, pending] = useActionState(savePrompts, PROFILE_INITIAL);
  const [rows, setRows] = useState<ProfilePromptAnswer[]>(
    answers.length > 0 ? [...answers] : [{ id: PROFILE_PROMPTS[0].id, answer: "" }],
  );

  const update = (index: number, patch: Partial<ProfilePromptAnswer>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
      <h2 className="text-[1.2rem]">{C.promptsHeading}</h2>
      <p className="mt-3 text-[15px] leading-[1.7] text-ink-2">{C.promptsIntro}</p>

      {answers.length === 0 ? (
        <p className="mt-4 text-[14.5px] text-caution">{C.promptsEmpty}</p>
      ) : null}

      <form action={act} className="mt-6 flex flex-col gap-6">
        <input type="hidden" name="prompts" value={JSON.stringify(rows)} />

        {rows.map((row, index) => (
          <div key={index} className="flex flex-col gap-2.5">
            <label className="text-[14px] text-ink-2" htmlFor={`prompt-${index}`}>
              {C.promptChoose}
            </label>
            <select
              id={`prompt-${index}`}
              value={row.id}
              onChange={(event) => update(index, { id: event.target.value })}
              className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
            >
              {PROFILE_PROMPTS.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.question}
                </option>
              ))}
            </select>

            <textarea
              aria-label={C.promptAnswerLabel}
              value={row.answer}
              maxLength={PROMPT_ANSWER_MAX_CHARS}
              rows={3}
              onChange={(event) => update(index, { answer: event.target.value })}
              className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[15px] focus:border-accent focus:outline-none"
            />
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          {rows.length < MAX_PROMPTS ? (
            <button
              type="button"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    id:
                      PROFILE_PROMPTS.find((p) => !current.some((r) => r.id === p.id))?.id ??
                      PROFILE_PROMPTS[0].id,
                    answer: "",
                  },
                ])
              }
              className="ease-brand rounded-lg border border-line-2 px-4 py-2 text-[14.5px] transition-colors duration-200 hover:border-accent"
            >
              Add another
            </button>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="ease-brand rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
          >
            {C.promptSaveLabel}
          </button>
        </div>

        {state.error ? (
          <p role="alert" className="text-[14px] text-critical">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
