"use client";

import { useActionState, useRef, useState } from "react";

import { COPY, DRAFT_COPY, QUIZ_QUESTIONS } from "@plusone/config";

import { saveQuiz } from "./actions";
import { QUIZ_INITIAL, type QuizState } from "./state";
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
export function QuizForm({
  answered: given = {},
  save,
}: {
  answered?: Record<string, string>;
  /**
   * The profile's action, which saves each answer where it is tapped and stays
   * put.
   *
   * Passed in rather than switched on a boolean so the step keeps importing
   * exactly one action and the profile keeps importing exactly one: a flag
   * would have put requireStep and a redirect into the bundle of a screen that
   * must never reach either.
   */
  save?: (previous: QuizState, formData: FormData) => Promise<QuizState>;
}) {
  const settings = save !== undefined;
  const [state, act, pending] = useActionState(save ?? saveQuiz, QUIZ_INITIAL);
  const form = useRef<HTMLFormElement>(null);
  /** Nothing to report until something is answered. */
  const [touched, setTouched] = useState(false);
  // Seeded from the saved response. The radios are CONTROLLED, so a
  // defaultChecked would lose to the state on first render — a member walking
  // back into the quiz found twelve blank questions and no sign they had ever
  // answered them.
  const [answers, setAnswers] = useState<Record<string, string>>(given);

  const answered = Object.keys(answers).length;

  return (
    <form
      ref={form}
      action={act}
      className={settings ? "flex flex-col gap-10" : "mt-10 flex flex-col gap-10"}
    >
      {/* On the profile the count is already in the section's own summary, and
          twice is once too many. */}
      {settings ? null : (
        <p className="text-[11.3px] text-ink-3" role="status" aria-live="polite">
          {C.progress(answered, QUIZ_QUESTIONS.length)}
        </p>
      )}

      {QUIZ_QUESTIONS.map((question) => (
        <fieldset key={question.id} className="flex flex-col gap-3">
          <legend className="mb-3 text-[13.4px] leading-[1.5]">{question.question}</legend>
          {question.options.map((option) => (
            <label
              key={option.id}
              className="ease-brand flex cursor-pointer items-center min-h-tap gap-3.5 rounded-lg border border-line-control bg-surface px-4 py-3 text-[12.6px] transition-colors duration-300 has-checked:border-accent"
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={answers[question.id] === option.id}
                onChange={() => {
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: option.id,
                  }));
                  if (!settings) return;
                  setTouched(true);
                  // After the state lands, so the posted form carries the
                  // answer that was just chosen rather than the one before it.
                  requestAnimationFrame(() => form.current?.requestSubmit());
                }}
                className="size-[13.8px] shrink-0 accent-accent"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ))}

      {state.error ? (
        <p role="alert" className="text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}

      {/* On the profile there is nothing to finish, nothing to skip and
          nowhere to go back to — the answers are saved as they are chosen, and
          a member who wants to stop simply stops. */}
      {settings ? (
        touched ? (
          <p role="status" className="text-[11.3px] text-ink-3">
            {pending
              ? DRAFT_COPY.app.settingSaving
              : state.error
                ? ""
                : DRAFT_COPY.app.settingSaved}
          </p>
        ) : null
      ) : (
        <>
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
              className="ease-brand text-[12.2px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink disabled:opacity-55"
            >
              {C.skipLabel}
            </button>
          </StepActions>

          {answered === 0 ? <p className="text-[11.3px] text-ink-3">{C.skipNudge}</p> : null}
        </>
      )}
    </form>
  );
}
