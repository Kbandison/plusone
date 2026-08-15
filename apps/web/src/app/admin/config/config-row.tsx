"use client";

import { useActionState } from "react";

import { CONFIG_INITIAL, setConfig } from "./actions";

export function ConfigRow({ configKey, value }: { configKey: string; value: string }) {
  const [state, act, pending] = useActionState(setConfig, CONFIG_INITIAL);

  return (
    <li className="flex flex-wrap items-center gap-4 border-b border-line py-4 last:border-0">
      <code className="min-w-[240px] flex-1 text-[14px] text-ink-2">{configKey}</code>

      <form action={act} className="flex items-center gap-3">
        <input type="hidden" name="key" value={configKey} />
        <label className="sr-only" htmlFor={`v-${configKey}`}>
          {configKey}
        </label>
        <input
          id={`v-${configKey}`}
          name="value"
          type="number"
          step="any"
          defaultValue={value}
          className="w-[110px] rounded-lg border border-line-2 bg-ground px-3 py-2 text-[15px] tabular-nums focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="ease-brand rounded-lg border border-line-2 px-4 py-2 text-[14.5px] transition-colors duration-200 hover:border-accent disabled:opacity-55"
        >
          Save
        </button>
      </form>

      {state.error ? (
        <span role="alert" className="text-[13.5px] text-critical">
          {state.error}
        </span>
      ) : null}
      {state.message ? (
        <span role="status" className="text-[13.5px] text-positive">
          Saved
        </span>
      ) : null}
    </li>
  );
}
