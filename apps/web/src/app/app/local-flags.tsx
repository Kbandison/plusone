"use client";

import { useSyncExternalStore } from "react";

/**
 * A set of ids kept on the device, and nothing else.
 *
 * ── extracted rather than copied ───────────────────────────────────────────
 *
 * `hint.tsx` had exactly this — a listener set, a raw-string snapshot, a
 * tolerant parse and a write that notifies. The beta welcome and the beta
 * checklist need the same thing against two more keys, and three copies of a
 * store is three places for the two subtle parts to be got wrong.
 *
 * Both subtle parts are load-bearing and neither is obvious:
 *
 *   - THE SNAPSHOT IS THE RAW STRING. `useSyncExternalStore` compares
 *     snapshots by identity, so returning a parsed array builds a new array
 *     every call, which never equals the last one, which re-renders, which
 *     reads again — an infinite loop. Parsing happens in the component.
 *   - THE STORE KEEPS ITS OWN LISTENERS. The `storage` event fires in OTHER
 *     tabs and never in the one that wrote, so without this a member ticks a
 *     box and watches nothing happen until they reload.
 *
 * Nothing here reaches the database, deliberately: which parts of an HSV and
 * HIV app a particular person has used is behavioural data, and server-side it
 * would sit in a table, in every backup, and in any subject access request.
 * A cookie is worse — sent with every request, straight into access logs. The
 * full argument is on HINTS_STORAGE_KEY.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    // Private browsing, a full quota, or a hand-edited value. Unreadable is
    // treated as empty, which shows the welcome again and un-ticks the list —
    // the right way round, since the failure is seeing something twice rather
    // than losing it.
    return "";
  }
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

/** Null means "not known yet", which is what keeps the server render empty. */
const serverSnapshot = (): null => null;

/**
 * The ids stored under `key`, and a toggle.
 *
 * `null` while the first client render has not happened — the caller renders
 * nothing until then rather than flashing a welcome at somebody who dismissed
 * it a week ago.
 */
export function useLocalFlags(key: string): {
  flags: string[] | null;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  add: (id: string) => void;
} {
  const raw = useSyncExternalStore(subscribe, () => read(key), serverSnapshot);
  const flags = raw === null ? null : parse(raw);

  const write = (next: string[]) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage refused. It comes back next time, which is the safe direction.
    }
    for (const listener of listeners) listener();
  };

  return {
    flags,
    has: (id) => (flags ?? []).includes(id),
    add: (id) => write([...new Set([...(flags ?? []), id])]),
    toggle: (id) =>
      write(
        (flags ?? []).includes(id)
          ? (flags ?? []).filter((x) => x !== id)
          : [...new Set([...(flags ?? []), id])],
      ),
  };
}
