import { QUIZ_QUESTIONS, QUIZ_TRAITS, type QuizTrait } from "@plusone/config";

/**
 * The compatibility quiz (§7.2, §6.1).
 *
 * Answers become a six-element trait vector, which is what quizCompat compares.
 * The vector is the only thing that leaves this module — the raw answers stay
 * in `quiz_responses`, which is own-rows-only, because "which option did they
 * pick for question nine" is a more revealing thing to hand around than a
 * similarity score.
 *
 * Two properties worth stating:
 *
 *   1. A PARTIAL QUIZ IS A VALID QUIZ. Every trait averages only the questions
 *      actually answered, so someone who stops at question four gets a real
 *      vector rather than a distorted one. §7.2 makes the whole thing
 *      skippable; making it all-or-nothing inside would be the same rule broken
 *      one level down.
 *
 *   2. NO ANSWER IS WORTH MORE THAN ANOTHER. Weights run negative to positive
 *      along a trait, not low to high along a quality, and the vector is
 *      compared by direction. There is no way to score well here, only to score
 *      like someone.
 */

/** Question id -> chosen option id. Missing entries are simply unanswered. */
export type QuizAnswers = Readonly<Record<string, string>>;

export const TRAIT_COUNT = QUIZ_TRAITS.length;

/**
 * The trait vector, in QUIZ_TRAITS order.
 *
 * A trait with no answered questions sits at 0 — neutral, which pulls a cosine
 * comparison toward the middle rather than toward anyone in particular.
 */
export function traitVector(answers: QuizAnswers): number[] {
  const totals = new Map<QuizTrait, { sum: number; count: number }>();

  for (const question of QUIZ_QUESTIONS) {
    const chosen = answers[question.id];
    if (chosen === undefined) continue;

    const option = question.options.find((o) => o.id === chosen);
    if (!option) continue; // a retired option should not poison the vector

    const current = totals.get(question.trait) ?? { sum: 0, count: 0 };
    totals.set(question.trait, { sum: current.sum + option.weight, count: current.count + 1 });
  }

  return QUIZ_TRAITS.map((trait) => {
    const entry = totals.get(trait);
    return entry && entry.count > 0 ? entry.sum / entry.count : 0;
  });
}

/** How many questions have a usable answer. */
export function answeredCount(answers: QuizAnswers): number {
  return QUIZ_QUESTIONS.filter((question) => {
    const chosen = answers[question.id];
    return chosen !== undefined && question.options.some((o) => o.id === chosen);
  }).length;
}

/** Whether the member has answered anything at all. */
export function hasAnswers(answers: QuizAnswers): boolean {
  return answeredCount(answers) > 0;
}

/**
 * A vector of all zeroes — someone who skipped, or answered nothing usable.
 *
 * Returned rather than null so a caller cannot forget the case: an all-zero
 * vector scores neutral against everyone, which is exactly what a skip should
 * mean.
 */
export const NEUTRAL_VECTOR: readonly number[] = QUIZ_TRAITS.map(() => 0);
