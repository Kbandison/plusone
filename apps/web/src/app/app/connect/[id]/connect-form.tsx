"use client";

import { useActionState, useState } from "react";

import { DRAFT_COPY, promptQuestion, type ProfilePromptAnswer } from "@plusone/config";

import { sendConnect } from "./actions";
import { CONNECT_INITIAL } from "./state";

const C = DRAFT_COPY.app;

export function ConnectForm({
  targetId,
  prompts,
  source,
  roomId,
}: {
  targetId: string;
  prompts: readonly ProfilePromptAnswer[];
  source: string;
  roomId: string | null;
}) {
  const [state, act, pending] = useActionState(sendConnect, CONNECT_INITIAL);
  const [selected, setSelected] = useState(prompts[0]?.id ?? "");

  if (prompts.length === 0) {
    return <p className="mt-8 text-[16px] text-ink-2">{C.connectNoPrompts}</p>;
  }

  return (
    <form action={act} className="mt-8 flex flex-col gap-6">
      <input type="hidden" name="target_id" value={targetId} />
      <input type="hidden" name="source" value={source} />
      {roomId ? <input type="hidden" name="room_id" value={roomId} /> : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[14px] text-ink-2">{C.promptChoose}</legend>
        {prompts.map((prompt) => (
          <label
            key={prompt.id}
            className="ease-brand flex cursor-pointer flex-col gap-1.5 rounded-lg border border-line-2 bg-surface px-4 py-3.5 transition-colors duration-200 has-checked:border-accent"
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="prompt_id"
                value={prompt.id}
                checked={selected === prompt.id}
                onChange={() => setSelected(prompt.id)}
                className="size-[16px] accent-accent"
              />
              <span className="text-[13.5px] text-ink-3">{promptQuestion(prompt.id)}</span>
            </span>
            <span className="pl-[28px] text-[15.5px] leading-[1.6]">{prompt.answer}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-2 text-[14px] text-ink-2">
        {C.connectReplyLabel}
        <textarea
          name="reply"
          rows={4}
          maxLength={500}
          required
          className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[15.5px] focus:border-accent focus:outline-none"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="ease-brand self-start rounded-lg bg-accent px-6 py-3 text-[16px] text-accent-ink transition-opacity duration-200 hover:opacity-90 disabled:opacity-55"
      >
        {C.connectSendLabel}
      </button>
    </form>
  );
}
