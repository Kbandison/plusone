"use client";

/**
 * One like, however many buttons are drawn for it.
 *
 * A post with a photograph renders its counts TWICE — once in the feed row and
 * once under the full-screen image — and post-row is a Server Component, so
 * those are two separate client islands with two separate pieces of state and
 * no way to see each other.
 *
 * The result was worse than a stale number. Liking in the row left the lightbox
 * still showing nought; pressing it there computed "not liked, so like it" from
 * its own stale view, sent a toggle to a server that had it liked already, and
 * got back the unlike — so the count flicked to 1 and snapped to 0. The two
 * halves were arguing, and the server was answering both honestly.
 *
 * A module-level store rather than lifting the state: lifting it means making
 * post-row a Client Component, and post-row signs image URLs and reads the
 * feed. The store is keyed by post id, so every button for the same post is the
 * same button.
 *
 * ── why entries carry their basis ────────────────────────────────────────────
 *
 * An optimistic value has to win until the server catches up, and then lose.
 * Each entry records the server props it was computed FROM, so a render whose
 * props no longer match simply ignores it — no effect, no clearing pass, and
 * nothing mutated while rendering. A stale entry is not wrong, it is just not
 * used, and the next press overwrites it.
 */

export interface LikeView {
  readonly liked: boolean;
  readonly count: number;
}

interface Entry extends LikeView {
  /** The server props this was derived from. Once they move, this is history. */
  readonly basis: string;
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

/** Two numbers and a flag, as one comparable string. */
export function basisOf(liked: boolean, count: number): string {
  return `${liked ? 1 : 0}:${count}`;
}

export function subscribeLike(id: string, onChange: () => void): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(onChange);
  listeners.set(id, set);
  return () => {
    set.delete(onChange);
    if (set.size === 0) listeners.delete(id);
  };
}

export function readLike(id: string): Entry | undefined {
  return entries.get(id);
}

export function writeLike(id: string, view: LikeView, basis: string): void {
  entries.set(id, { ...view, basis });
  for (const listener of listeners.get(id) ?? []) listener();
}
