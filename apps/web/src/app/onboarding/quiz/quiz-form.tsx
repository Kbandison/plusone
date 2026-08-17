"use client";

import { useActionState, useState } from "react";

import { DRAFT_COPY, QUIZ_QUESTIONS } from "@plusone/config";

import { saveQuiz } from "./actions";
import { QUIZ_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

const C = DRAFT_COPY.quiz;

/**
 * The quiz — "skippable-but-nudged" (§7.2).
 *
 * The nudge is a sentence, not a friction: skip is a plain button of equal
 * weight, not hidden behind a confirmation or greyed until you scroll. §3.3
 * bans engagement-bait, and a skip you have to fight for is exactly that.
 *
 * Partial answers are kept. Someone who does four and stops has told us
 * something true, and throwing it away to insist on twelve would be the app
 * preferring completeness to honesty.
 */
export function QuizForm() {
  const [state, act, pending] = useActionState(saveQuiz, QUIZ_INITIAL);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const answered = Object.keys(answers).length;

  return (
    <form action={act} className="mt-10 flex flex-col gap-10">
      <p className="text-[14px] text-ink-3" role="status" aria-live="polite">
        {C.progress(answered, QUIZ_QUESTIONS.length)}
      </p>

      {QUIZ_QUESTIONS.map((question) => (
        <fieldset key={question.id} className="flex flex-col gap-3">
          <legend className="mb-3 text-[16.5px] leading-[1.5]">{question.question}</legend>
          {question.options.map((option) => (
            <label
              key={option.id}
              className="ease-brand flex cursor-pointer items-center min-h-tap gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[15.5px] transition-colors duration-200 has-checked:border-accent"
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={answers[question.id] === option.id}
                onChange={() =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: option.id,
                  }))
                }
                className="size-[17px] shrink-0 accent-accent"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ))}

      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {C.finishLabel}
        </button>

        <button
          type="submit"
          name="skip"
          value="1"
          disabled={pending}
          className="ease-brand text-[15px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink disabled:opacity-55"
        >
          {C.skipLabel}
        </button>
      </div>

      {answered === 0 ? <p className="text-[14px] text-ink-3">{C.skipNudge}</p> : null}
    </form>
  );
}
