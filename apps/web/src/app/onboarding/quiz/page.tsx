import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { ownQuizAnswers } from "@/lib/own-profile";
import { QuizForm } from "./quiz-form";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

export const metadata: Metadata = { title: DRAFT_COPY.quiz.heading };

export default async function QuizPage() {
  const { userId } = await requireStep("quiz");
  const answered = await ownQuizAnswers(userId);

  return (
    <StepShell step="quiz" heading={DRAFT_COPY.quiz.heading} intro={DRAFT_COPY.quiz.intro}>
      <QuizForm answered={answered} />
    </StepShell>
  );
}
