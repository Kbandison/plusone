import type { Metadata } from "next";

import {
  COPY,
  DRAFT_COPY,
  INTENTION_LABELS,
  promptQuestion,
  type Intention,
  type ProfilePromptAnswer,
} from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { ModeToggle } from "./mode-toggle";
import { PromptEditor } from "./prompt-editor";

export const metadata: Metadata = { title: "You" };

export default async function ProfilePage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, intention, mode, search_radius_mi, bio, prompts")
    .eq("id", auth.user!.id)
    .maybeSingle();

  const mode = profile?.mode === "support_only" ? "support_only" : "dating";
  const intention = profile?.intention as Intention | null;
  const prompts = (profile?.prompts ?? []) as ProfilePromptAnswer[];

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{profile?.display_name ?? "You"}</h1>

      <dl className="mt-8 flex flex-col gap-5">
        <div>
          <dt className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">Looking for</dt>
          <dd className="mt-1.5 text-[16px]">
            {intention ? INTENTION_LABELS[intention] : "Not set"}
          </dd>
          {/* §3.4, verbatim. The lock is what makes the answer mean something. */}
          <dd className="mt-1.5 text-[14px] text-ink-3">{COPY.intention.lockNotice}</dd>
        </div>

        <div>
          <dt className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">Search radius</dt>
          <dd className="mt-1.5 text-[16px]">{profile?.search_radius_mi ?? 50} miles</dd>
        </div>
      </dl>

      {prompts.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[1.2rem]">{DRAFT_COPY.app.promptsHeading}</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {prompts.map((prompt) => (
              <li key={prompt.id} className="rounded-lg border border-line px-5 py-4">
                <p className="text-[13.5px] text-ink-3">{promptQuestion(prompt.id)}</p>
                <p className="mt-1.5 text-[15.5px] leading-[1.6]">{prompt.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PromptEditor answers={prompts} />
      <ModeToggle mode={mode} />
    </main>
  );
}
