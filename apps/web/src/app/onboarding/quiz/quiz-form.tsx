"use client";

import { useActionState, useState } from "react";

import { COPY, DRAFT_COPY, QUIZ_QUESTIONS } from "@plusone/config";

import { saveQuiz } from "./actions";
import { QUIZ_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";
import { StepActions, backButtonClass } from "@/app/onboarding/step-actions";
import { onboarding } from "@plusone/logic";

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
export function QuizForm({ answered: given = {} }: { answered?: Record<string, string> }) {
  const [state, act, pending] = useActionState(saveQuiz, QUIZ_INITIAL);
  // Seeded from the saved response. The radios are CONTROLLED, so a
  // defaultChecked would lose to the state on first render — a member walking
  // back into the quiz found twelve blank questions and no sign they had ever
  // answered them.
  const [answers, setAnswers] = useState<Record<string, string>>(given);

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

      {/* Finish, skip and back on one line. The quiz is the only step with
          three ways out of it, and §7.2 marks it skippable — so the skip has to
          stay as visible as it was, and Back cannot look like a fourth kind of
          answer to the questions above. */}
      <StepActions
        step="quiz"
        // A submit, not a link. Back has to carry the answers with it here —
        // twelve questions are too many to lose to a glance at the screen
        // before — so this posts the form and saveQuiz sends it backwards
        // instead of forwards. It writes nothing when nothing is answered.
        back={
          onboarding.backStep("quiz") ? (
            <button
              type="submit"
              name="back"
              value="1"
              disabled={pending}
              className={backButtonClass}
            >
              {DRAFT_COPY.steps.backLabel}
            </button>
          ) : null
        }
      >
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {COPY.actions.continueLabel}
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
      </StepActions>

      {answered === 0 ? <p className="text-[14px] text-ink-3">{C.skipNudge}</p> : null}
    </form>
  );
}
