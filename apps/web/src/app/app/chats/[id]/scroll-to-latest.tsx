"use client";

import { useEffect } from "react";

/**
 * Opens the thread where the conversation is, not where it started.
 *
 * A chat is read from the bottom. Every load landed on the first message the
 * two people ever exchanged, so the newest one — the reason the screen was
 * opened — was however many screens down.
 *
 * Not focus, only scroll. Moving focus on load takes it away from wherever the
 * member put it and makes a screen reader announce a message they did not ask
 * for; the reading order is already correct, and this only decides which end of
 * it the page opens on.
 *
 * ── why this holds the bottom rather than jumping to it ──────────────────────
 *
 * Jumping once did not work, and neither did jumping twice. Everything that
 * decides where this page sits happens AFTER a mount effect:
 *
 *   · the router scrolls a new route to the top, after the render that put it
 *     there;
 *   · the browser restores the previous scroll position on a reload, on its own
 *     schedule;
 *   · every photograph in the thread is a signed URL that has not loaded, and
 *     each one that arrives makes the document taller than it was when we
 *     measured;
 *   · so do the two web fonts.
 *
 * Racing four things with a guess at the delay is how the last two attempts
 * went. So this stops guessing: it holds the bottom while the page is still
 * settling, and lets go the moment the member scrolls — or after a second and a
 * half, whichever comes first, so nothing is fighting a reader for the life of
 * the screen.
 */
export function ScrollToLatest({ token }: { token: string }) {
  useEffect(() => {
    let holding = true;

    const jump = () => {
      if (!holding) return;
      // "instant", because this is not a transition anybody asked for. The
      // reduced-motion rule in globals.css forces `scroll-behavior: auto`
      // anyway; this makes it true for everyone.
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    };

    jump();

    // Fires for a photograph arriving, a font swapping and the keyboard opening
    // — every reason the page's height changes, rather than the one or two
    // reasons a timer would have covered.
    const growth = new ResizeObserver(jump);
    growth.observe(document.body);
    window.addEventListener("load", jump);

    /**
     * And the case a height observer cannot see: the router moving the page
     * without changing its size.
     *
     * Next scrolls a new route to the top after the render that created it,
     * which is a scroll with no resize behind it — so nothing above would fire
     * and the thread would open at the first message anyway.
     *
     * Safe to listen for, despite every jump causing one: the release handlers
     * below run on wheel, touchstart and keydown, and all three fire BEFORE the
     * scroll they produce. By the time a member's own scroll event arrives,
     * this listener is already gone. And a jump that is already at the bottom
     * moves nothing, so there is no loop.
     */
    window.addEventListener("scroll", jump, { passive: true });

    /**
     * The member is in charge from the moment they say so.
     *
     * A wheel, a drag or an arrow key is somebody reading back through the
     * thread, and continuing to drag them to the bottom after that would be the
     * page arguing with them. The scroll event itself cannot be used for this:
     * every jump above fires one.
     */
    const release = () => {
      holding = false;
      growth.disconnect();
      window.removeEventListener("load", jump);
      window.removeEventListener("scroll", jump);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("keydown", release);
      window.clearTimeout(timer);
    };

    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchstart", release, { passive: true });
    window.addEventListener("keydown", release);
    const timer = window.setTimeout(release, 1500);

    return release;
    // The token changes when a message arrives or is sent, which is the other
    // moment the bottom is where a member wants to be.
  }, [token]);

  return null;
}
