/**
 * Asking the device where it is, once, in the one way this app does it.
 *
 * Extracted from `radius-form.tsx` on 2026-09-20 when a second caller appeared
 * — the profile's "update my location" button. Every comment below was paid for
 * in a real failure and none of it survives being written twice.
 *
 * Returns the position AND why, because "we used your rough area" and "we have
 * no idea where you are" have completely different consequences and only the
 * second leaves the app empty.
 */
export type LocateOutcome = "exact" | "approximate" | "unknown";

export interface Located {
  readonly where: { lat: number; lon: number } | null;
  readonly outcome: LocateOutcome;
}

export async function locate(
  /** From the request's IP. Used only if the device will not say. */
  approximate?: { lat: number; lon: number } | null,
): Promise<Located> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { where: approximate ?? null, outcome: approximate ? "approximate" : "unknown" };
  }

  return new Promise<Located>((resolve) => {
    /**
     * Our own timer, because the platform's `timeout` is not a promise.
     *
     * In WKWebView — the iOS shell — `getCurrentPosition` can call NEITHER
     * callback, ever. Not success, not error, and the 8000 below is ignored
     * because the request never starts: iOS will not ask for a permission the
     * app has not declared, and it says nothing about refusing. Measured in the
     * Simulator on 2026-08-29, when the app's Info.plist was missing
     * NSLocationWhenInUseUsageDescription.
     *
     * That string is added now, so this should not happen. The timer stays
     * anyway, because the failure it prevents is the worst shape a bug can
     * take: a promise that never settles means the caller's action is never
     * dispatched, so the button does nothing at all — no error, no pending
     * state, no clue.
     *
     * A comment where this used to live said "Never blocks". It did.
     */
    let settled = false;
    const done = (result: Located) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      resolve(result);
    };
    const giveUp = () =>
      done({
        where: approximate ?? null,
        outcome: approximate ? "approximate" : "unknown",
      });

    // Longer than the platform's own timeout, so a browser that honours its
    // contract still gets to answer first and this never pre-empts it.
    const fallback = setTimeout(giveUp, 12000);

    navigator.geolocation.getCurrentPosition(
      (position) =>
        done({
          where: { lat: position.coords.latitude, lon: position.coords.longitude },
          outcome: "exact",
        }),
      giveUp,
      // Low accuracy on purpose: the answer is rounded to about a kilometre the
      // moment it lands, so asking for a GPS fix would spend a member's battery
      // and seconds to produce digits that are then thrown away.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  });
}
