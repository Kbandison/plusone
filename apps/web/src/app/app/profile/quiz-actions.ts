"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { QUIZ_QUESTIONS } from "@plusone/config";
import { quiz } from "@plusone/logic";

import { getServerSupabase } from "@/lib/supabase";
import type { QuizState } from "@/app/onboarding/quiz/state";

/**
 * The quiz, answered from the profile.
 *
 * "Skip for now" was a one-way door. A skip writes an empty row, `resolveStep`
 * reads presence rather than content, so the step is settled and never shown
 * again — and nothing anywhere in /app linked to it. A member who took the app
 * at its word on step 8 had no way back to the twelve questions that shape
 * every Drop they will ever see. "For now" meant forever.
 *
 * Not the onboarding action: that one calls requireStep and ends in a redirect
 * to the next step, and a member changing an answer three months later belongs
 * on the page they are already on.
 */
export async function saveQuizSetting(
  _previous: QuizState,
  formData: FormData,
): Promise<QuizState> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // Rebuilt from the form rather than patched onto what is stored: every radio
  // is posted, so this IS the whole answer set, and reading-then-merging would
  // lose a de-selection the moment one becomes possible.
  const answers: Record<string, string> = {};
  for (const question of QUIZ_QUESTIONS) {
    const chosen = formData.get(question.id);
    if (typeof chosen !== "string") continue;
    if (!question.options.some((option) => option.id === chosen)) continue;
    answers[question.id] = chosen;
  }

  // Answers and the computed vector are written together, for the reason the
  // step gives: storing answers alone would mean recomputing on every read with
  // whatever the weights happen to be that week, and a member's compatibility
  // silently changing because a question was reworded is not something they
  // could ever see.
  const { error } = await supabase.from("quiz_responses").upsert(
    {
      user_id: auth.user.id,
      answers,
      trait_vector: quiz.traitVector(answers),
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: "That didn't save. Try again." };

  // The Drop is ordered by this.
  for (const path of ["/app", "/app/profile"]) revalidatePath(path);
  return { error: null };
}
