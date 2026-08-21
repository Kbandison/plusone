"use client";

import { useEffect } from "react";

/**
 * Opens the thread where the conversation is, not where it started.
 *
 * A chat is read from the bottom. Every load and every refresh landed on the
 * first message the two people ever exchanged, so the newest one — the reason
 * the screen was opened — was however many screens down. On a long thread that
 * is a scroll every single time.
 *
 * Not focus, only scroll. Moving focus on load takes it away from wherever the
 * member put it and makes a screen reader announce a message they did not ask
 * for; the reading order is already correct, and this only decides which end of
 * it the page opens on.
 *
 * Instant rather than smooth: this is not a transition a member asked for, and
 * an animated jump on every load is motion for its own sake.
 */
export function ScrollToLatest({ token }: { token: string }) {
  useEffect(() => {
    const jump = () =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });

    jump();

    // Three times, because the page is not its final height when the effect
    // runs. Browsers restore the previous scroll position on a reload — after
    // React has mounted, on some timings — and every photograph in the thread
    // is a signed URL that has not loaded yet, so each one that arrives makes
    // the document taller than it was when we jumped.
    const frame = requestAnimationFrame(jump);
    window.addEventListener("load", jump);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("load", jump);
    };
    // The token changes when a message arrives or is sent, which is the other
    // moment the bottom is where a member wants to be.
  }, [token]);

  return null;
}
