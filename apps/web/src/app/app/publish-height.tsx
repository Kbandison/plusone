"use client";

import { useEffect } from "react";

/**
 * Measures an element and publishes its height as a CSS variable.
 *
 * Two things in this app have to be exactly as tall as something else: the page
 * has to clear the bottom nav, and a chat thread has to clear the composer
 * pinned above it. Neither height can be written down — the nav wraps to two
 * rows when five labels do not fit the width, and the composer grows a line
 * when a fuse is running or an image is attached. Both depend on the labels,
 * the font and the phone.
 *
 * A ResizeObserver rather than a resize listener: the heights change for
 * reasons a viewport resize never sees — a support-only member has one nav link
 * fewer, a font loads late and moves where a row breaks, a photograph is
 * attached to the composer.
 *
 * Renders nothing. The stylesheet keeps a value for the first paint and for
 * anyone with no JavaScript.
 */
export function PublishHeight({ targetId, cssVar }: { targetId: string; cssVar: string }) {
  useEffect(() => {
    const element = document.getElementById(targetId);
    if (!element) return;

    const publish = () =>
      document.documentElement.style.setProperty(cssVar, `${element.offsetHeight}px`);

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      // Back to the stylesheet's value rather than a stale pixel count, for the
      // screens this does not render on.
      document.documentElement.style.removeProperty(cssVar);
    };
  }, [targetId, cssVar]);

  return null;
}
