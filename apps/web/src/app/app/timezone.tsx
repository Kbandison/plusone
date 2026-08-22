"use client";

import { useEffect } from "react";

import { reportTimezone } from "./timezone-actions";

/**
 * Tells the server what time it is where the member is.
 *
 * profiles.timezone was read in four places and written in none, so every row
 * in the database said 'UTC' — the column default. Every timestamp in the app
 * was rendered in UTC, and the drop landed at 20:00 UTC for everybody, which is
 * four in the afternoon in New York and five in the morning in Sydney.
 *
 * Reported from the browser because the browser is the only thing that knows.
 * An IP lookup guesses, and guesses wrongly for anyone on a VPN — which, on an
 * app for people with a diagnosis they may not be public about, is not a small
 * population.
 *
 * On every load rather than once at signup, so somebody who moves or travels
 * stops getting their evening at the wrong hour. The RPC writes only when the
 * value differs, so the repeat costs a function call and no row write.
 *
 * `prop` rather than a fetch: the current value comes from the page that
 * already read the profile, so the common case — nothing changed — never
 * touches the network at all.
 */
export function Timezone({ current }: { current: string }) {
  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone || zone === current) return;
    void reportTimezone(zone);
  }, [current]);

  return null;
}
