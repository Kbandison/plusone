"use server";

import { redirect } from "next/navigation";

import { QUIZ_QUESTIONS } from "@plusone/config";
import { quiz } from "@plusone/logic";

import { requireStep } from "@/lib/onboarding";
import { getServerSupabase } from "@/lib/supabase";

export type QuizState = { readonly error: string | null };
export const QUIZ_INITIAL: QuizState = { error: null };

/**
 * Saves the quiz.
 *
 * Answers and the computed vector are written together. Storing answers alone
 * would mean recomputing the vector on every read with whatever the weights
 * happen to be that week, and a member's compatibility silently changing
 * because a question was reworded is not something they could ever see.
 *
 * A skip writes an EMPTY row rather than no row. `resolveStep` reads presence,
 * so no row means "not settled" and the member would meet this screen forever.
 * The empty vector scores neutral against everyone, which is what a skip means.
 */
export async function saveQuiz(_previous: QuizState, formData: FormData): Promise<QuizState> {
  const { userId } = await requireStep("quiz");

  const answers: Record<string, string> = {};
  if (formData.get("skip") !== "1") {
    for (const question of QUIZ_QUESTIONS) {
      const chosen = formData.get(question.id);
      if (typeof chosen !== "string") continue;
      if (!question.options.some((option) => option.id === chosen)) continue;
      answers[question.id] = chosen;
    }
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("quiz_responses").upsert(
    {
      user_id: userId,
      answers,
      trait_vector: quiz.traitVector(answers),
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: "That didn't save. Try again." };

  redirect("/onboarding");
}
