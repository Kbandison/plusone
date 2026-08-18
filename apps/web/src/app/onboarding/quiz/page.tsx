import type { Metadata } from "next";

import { DRAFT_COPY } from "@plusone/config";

import { StepShell } from "../step-shell";
import { requireStep } from "@/lib/onboarding";
import { ownQuizAnswers } from "@/lib/own-profile";
import { QuizForm } from "./quiz-form";

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
