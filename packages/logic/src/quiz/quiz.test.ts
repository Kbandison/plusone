import { describe, expect, it } from "vitest";

import { QUIZ_QUESTIONS, QUIZ_QUESTION_COUNT, QUIZ_TRAITS } from "@plusone/config";

import { quizCompat } from "../drop/scoring";
import { NEUTRAL_VECTOR, TRAIT_COUNT, answeredCount, hasAnswers, traitVector } from "./index";

/** Picks option `index` for every question. */
const answerAll = (index: number) =>
  Object.fromEntries(
    QUIZ_QUESTIONS.map((q) => [q.id, q.options[index]?.id ?? q.options[0]!.id]),
  );

describe("the questions themselves", () => {
  // §7.2 asks for 10-12.
  it("has between 10 and 12", () => {
    expect(QUIZ_QUESTION_COUNT).toBeGreaterThanOrEqual(10);
    expect(QUIZ_QUESTION_COUNT).toBeLessThanOrEqual(12);
  });

  it("gives every question and option a unique id", () => {
    const ids = QUIZ_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const question of QUIZ_QUESTIONS) {
      const optionIds = question.options.map((o) => o.id);
      expect(new Set(optionIds).size, question.id).toBe(optionIds.length);
    }
  });

  it("covers every trait, more than once each", () => {
    for (const trait of QUIZ_TRAITS) {
      const covering = QUIZ_QUESTIONS.filter((q) => q.trait === trait);
      expect(covering.length, trait).toBeGreaterThanOrEqual(2);
    }
  });

  // No option is worth more than another: the weights run negative to positive
  // along a trait, and they balance, so there is no way to score well.
  it("balances every question around zero", () => {
    for (const question of QUIZ_QUESTIONS) {
      const total = question.options.reduce((sum, o) => sum + o.weight, 0);
      expect(Math.abs(total), question.id).toBeLessThan(0.001);
    }
  });

  it("keeps every weight inside -1..1", () => {
    for (const question of QUIZ_QUESTIONS) {
      for (const option of question.options) {
        expect(Math.abs(option.weight), `${question.id}/${option.id}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the trait vector", () => {
  it("has one number per trait", () => {
    expect(traitVector(answerAll(0))).toHaveLength(TRAIT_COUNT);
    expect(TRAIT_COUNT).toBe(QUIZ_TRAITS.length);
  });

  it("puts opposite answers at opposite ends", () => {
    const first = traitVector(answerAll(0));
    const last = traitVector(answerAll(3));
    for (let i = 0; i < first.length; i++) {
      expect(Math.sign(first[i]!)).toBe(-Math.sign(last[i]!));
    }
  });

  // §7.2 makes the quiz skippable. Making it all-or-nothing inside would be the
  // same rule broken one level down.
  it("accepts a partial quiz", () => {
    const partial = { [QUIZ_QUESTIONS[0]!.id]: QUIZ_QUESTIONS[0]!.options[0]!.id };
    const vector = traitVector(partial);
    expect(vector).toHaveLength(TRAIT_COUNT);
    expect(vector.some((v) => v !== 0)).toBe(true);
  });

  it("leaves an unanswered trait at neutral rather than guessing", () => {
    const oneTrait = QUIZ_QUESTIONS[0]!.trait;
    const partial = { [QUIZ_QUESTIONS[0]!.id]: QUIZ_QUESTIONS[0]!.options[0]!.id };
    const vector = traitVector(partial);
    for (const [i, trait] of QUIZ_TRAITS.entries()) {
      if (trait !== oneTrait) expect(vector[i], trait).toBe(0);
    }
  });

  it("ignores an option id that no longer exists", () => {
    const stale = { [QUIZ_QUESTIONS[0]!.id]: "retired-option" };
    expect(traitVector(stale)).toEqual([...NEUTRAL_VECTOR]);
    expect(answeredCount(stale)).toBe(0);
  });

  it("returns neutral for no answers at all", () => {
    expect(traitVector({})).toEqual([...NEUTRAL_VECTOR]);
    expect(hasAnswers({})).toBe(false);
  });

  it("counts what was actually answered", () => {
    expect(answeredCount(answerAll(1))).toBe(QUIZ_QUESTION_COUNT);
    expect(hasAnswers(answerAll(1))).toBe(true);
  });

  it("is deterministic and does not mutate its input", () => {
    const answers = answerAll(2);
    const snapshot = structuredClone(answers);
    expect(traitVector(answers)).toEqual(traitVector(answers));
    expect(answers).toEqual(snapshot);
  });
});

describe("how the vector scores in the Drop", () => {
  it("scores two identical members highest", () => {
    const same = traitVector(answerAll(0));
    expect(quizCompat(same, same)).toBeCloseTo(1);
  });

  it("scores opposites lowest", () => {
    expect(quizCompat(traitVector(answerAll(0)), traitVector(answerAll(3)))).toBeCloseTo(0);
  });

  // A skip must not read as incompatibility, or skippable is a lie.
  it("scores a skipped quiz neutral, not badly", () => {
    expect(quizCompat([...NEUTRAL_VECTOR], traitVector(answerAll(0)))).toBe(0.5);
  });

  it("puts a near-match above an opposite", () => {
    const me = traitVector(answerAll(0));
    const close = traitVector(answerAll(1));
    const opposite = traitVector(answerAll(3));
    expect(quizCompat(me, close)).toBeGreaterThan(quizCompat(me, opposite));
  });
});
