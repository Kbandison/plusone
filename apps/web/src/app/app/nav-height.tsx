"use client";

import { useEffect } from "react";

/**
 * Publishes the bottom nav's real height as --nav-h.
 *
 * The chat's composer pins itself directly above the bar, and the number it
 * needs is how tall the bar actually is. That was a guess in CSS — 6rem, then
 * 5rem past 640px — and a guess is wrong in both directions: too large left a
 * band of empty page between the composer and the nav, and too small would put
 * the composer behind it.
 *
 * It cannot be written down, either. The bar wraps to two rows when five labels
 * do not fit the width, which depends on the labels, the font and the phone —
 * so the same stylesheet has to describe a 57px bar and a 103px one.
 *
 * So it is measured. A ResizeObserver rather than a resize listener: the height
 * changes when the bar re-wraps, which a viewport resize is only one cause of —
 * a support-only member has one link fewer, and a font that loads late changes
 * where the row breaks.
 *
 * The CSS keeps a value for the first paint and for anyone without JavaScript.
 * It errs high on the narrow end, because a frame of gap is a frame of gap and
 * a frame of overlap hides the control a member is reaching for.
 */
export function NavHeight({ navId }: { navId: string }) {
  useEffect(() => {
    const nav = document.getElementById(navId);
    if (!nav) return;

    const publish = () =>
      document.documentElement.style.setProperty("--nav-h", `${nav.offsetHeight}px`);

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      // Back to the stylesheet's value rather than a stale pixel count, for the
      // screens this component does not render on.
      document.documentElement.style.removeProperty("--nav-h");
    };
  }, [navId]);

  return null;
}
