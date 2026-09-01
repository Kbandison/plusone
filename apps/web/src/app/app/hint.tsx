"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { HINTS, HINTS_STORAGE_KEY } from "@plusone/config";

/**
 * One thing this app does differently, said where it happens, once.
 *
 * ── it appears after hydration, and that is the considered trade ────────────
 *
 * `localStorage` does not exist on the server, so this cannot know whether to
 * render until it is in a browser. The two options are:
 *
 *   render, then hide     Correct the first time, and a FLASH on every visit
 *                         afterwards — which is the common case, forever.
 *   appear after hydration Clean on every visit afterwards, and a small layout
 *                         shift the one time somebody sees it.
 *
 * The second is chosen because the cost falls once and the benefit falls every
 * other time. A member who has read a hint should never see it flicker past
 * again.
 *
 * `getServerSnapshot` returns null as a sentinel meaning "not known yet", which
 * is what makes that work without a hydration mismatch: the server and the
 * hydrating client both render nothing, and the real value arrives immediately
 * after. Reading storage in a `useEffect` and calling `setState` would do the
 * same thing by cascading an extra render, which is what
 * `react-hooks/set-state-in-effect` refuses — correctly.
 *
 * ── not a toast, and not announced ──────────────────────────────────────────
 *
 * No `aria-live`. This is static content present when the screen is read, so a
 * screen reader meets it in document order, which is where it belongs. A live
 * region would interrupt whatever else was being announced to say something
 * nobody asked for, and a toast that auto-dismisses is worse still for anybody
 * who reads slowly.
 *
 * It is inline rather than floating, so it can be ignored. A note pinned over
 * the interface has to be dealt with before the screen can be used, which makes
 * it an obstacle rather than help.
 */
export function Hint({ id }: { id: string }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hint = HINTS.find((h) => h.id === id);

  // Parsed from the raw string rather than snapshotted as an array:
  // useSyncExternalStore compares snapshots by identity, and a fresh array
  // every call is an infinite loop. A string is a primitive and cannot be.
  const dismissed = useMemo(() => parse(raw), [raw]);

  if (!hint || raw === null || dismissed.includes(id)) return null;

  return (
    <aside className="mt-6 rounded-xl border border-line-2 bg-surface-2 p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[13.8px]">{hint.heading}</h2>

        <button
          type="button"
          onClick={() => remember(id)}
          // A word, not an ×. The glyph is a small target that reads as "close
          // the app" to somebody who has not met it before, and the 44px floor
          // applies to this as much as to anything else.
          className="ease-brand -my-2 -mr-2 flex min-h-tap shrink-0 items-center px-2 text-[11.7px] text-ink-3 transition-colors duration-200 hover:text-ink"
        >
          Got it
        </button>
      </div>

      <p className="mt-2 text-[12.6px] leading-[1.7] text-ink-2">{hint.body}</p>
    </aside>
  );
}

/** Bring them all back. Rendered in Settings — see the note there. */
export function ResetHints() {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        write(null);
        setDone(true);
      }}
      className="ease-brand min-h-tap text-[12.6px] text-ink-2 underline decoration-line-control underline-offset-4 transition-colors duration-200 hover:text-ink"
    >
      {done ? "The tips will show again" : "Show the tips again"}
    </button>
  );
}

// ── the store ────────────────────────────────────────────────────────────────
//
// Its own listener set rather than only the `storage` event: that event fires
// in OTHER tabs and never in the one that wrote, so dismissing a hint would
// leave it on screen until a reload.

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(HINTS_STORAGE_KEY) ?? "";
  } catch {
    // Private browsing, a full quota, or a value somebody hand-edited. A hint
    // that cannot read its own storage should SHOW — the failure mode is
    // seeing a note twice, and the alternative is silently teaching nobody.
    return "";
  }
}

/** Null means "not known yet", which is what keeps the server render empty. */
function getServerSnapshot(): null {
  return null;
}

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(next: string[] | null): void {
  try {
    if (next === null) window.localStorage.removeItem(HINTS_STORAGE_KEY);
    else window.localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage refused. The hint comes back next time, which is the right way
    // round to fail.
  }
  for (const listener of listeners) listener();
}

function remember(id: string): void {
  write([...new Set([...parse(getSnapshot()), id])]);
}
