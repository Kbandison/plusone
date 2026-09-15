"use client";

import { useEffect, useState } from "react";

/**
 * The header, pinned — with the wordmark leaving and the controls staying.
 *
 * Kevin's call 2026-09-15, chosen from a working mock of three behaviours
 * rather than from a description: the whole bar pinned, the bar shrinking, or
 * this. What it buys over the other two is the vertical space — the bar's box
 * stays where it is and goes transparent, so a phone gets the full screen back
 * for content while the bell, feedback and gear stay reachable from anywhere.
 *
 * What it costs is the wordmark on every scrolled view. That matters more in
 * the shells than on the web: a TWA and a WKWebView have no address bar, so
 * once "⁺One" is gone there is nothing on screen naming the app. Judged worth
 * it; recorded because it is the argument to reopen if it ever feels wrong.
 *
 * ── the transparent bar would have eaten every tap under it ────────────────
 *
 * A sticky element with no background still takes pointer events across its
 * whole box. So the top ~70px of scrolled content — a Drop card, a chat row,
 * the first post in a room — would have been visibly there and completely
 * dead, on every screen in the app, with nothing to see. `pointer-events-none`
 * on the bar once it is transparent, and `pointer-events-auto` back on the
 * controls, is what makes this safe rather than merely pretty.
 *
 * ── a listener rather than a scroll-driven animation ───────────────────────
 *
 * `animation-timeline: scroll()` does this in CSS with no JavaScript at all,
 * and it is the obvious answer until the two-engines rule is applied: this ships
 * to real Chrome in a TWA and to WKWebView through Capacitor, and those are as
 * far apart as Chrome and Safari. A scroll listener behaves identically in
 * both. Revisit when WebKit has shipped it everywhere we run.
 *
 * Passive, and rAF-throttled, because this runs on every screen.
 */
export function AppHeader({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        // 24px rather than 0. iOS rubber-bands past the top of a scroll and
        // reports small positive values on the way back, so a threshold of zero
        // makes the wordmark flicker on a bounce that never left the top.
        setScrolled(window.scrollY > 24);
        ticking = false;
      });
    };

    // Once on mount: a back-navigation restores the scroll position before this
    // runs, so without it the member returns to a mid-page scroll with the
    // wordmark drawn over their content.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled ? "" : undefined}
      /* -mx-6 px-6 so the bar can reach the screen edges when it has a
         background to draw; the layout's own gutter is restored inside it.
         pt clears the status bar — see the note in layout.tsx, which is the
         one thing here that predates this component and must not be lost. */
      className="group ease-brand sticky top-0 z-30 -mx-6 flex items-center justify-between px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 transition-[background-color,border-color] duration-300 data-scrolled:pointer-events-none"
    >
      {children}
    </header>
  );
}
