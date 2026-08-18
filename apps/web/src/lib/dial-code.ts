import "server-only";

import { headers } from "next/headers";
import { getCountryCallingCode, isSupportedCountry } from "libphonenumber-js/min";

/**
 * A suggested dialling code for the phone field, from the request's IP country.
 *
 * A SUGGESTION, and the distinction matters. `normalizePhone` refuses to invent
 * a country code — "guessing one silently sends a member's code to a stranger" —
 * and that stays exactly as it is. This puts a visible, editable "+44" in a
 * field the member reads before pressing anything. Nothing is inferred on their
 * behalf after they type.
 *
 * IP geolocation is a guess at the best of times, and this app's members have
 * more reason than most to be on a VPN. So it must always be wrong-able, which
 * is why it prefills a text input rather than selecting from a locked list.
 *
 * Read server-side from a header Vercel adds. No permission prompt, and no
 * browser geolocation API — asking somebody to share their location on the
 * first screen of an app about a stigmatised condition is the wrong trade for
 * saving them three keystrokes.
 *
 * Nothing is stored. The country never reaches the database, an analytics
 * event, or the member's row.
 */
export function dialCodeForCountry(country: string | null | undefined): string {
  // Absent off Vercel, and absent for a request Vercel cannot place.
  if (!country || !isSupportedCountry(country)) return "";

  try {
    return `+${getCountryCallingCode(country)}`;
  } catch {
    // The metadata disagrees with isSupportedCountry. Better an empty field than
    // a wrong prefix a member trusts.
    return "";
  }
}

export async function suggestedDialCode(): Promise<string> {
  return dialCodeForCountry((await headers()).get("x-vercel-ip-country"));
}

/**
 * A coarse position from the request's IP, for a member who refuses the browser
 * prompt or whose device cannot answer it.
 *
 * City-level at best, and that is the point: §12 stores location rounded to
 * about a kilometre anyway, so an IP guess is only a little worse than the
 * precise answer once it has been through round_location. Absent off Vercel.
 *
 * Never used INSTEAD of the browser when the browser answers — a member who
 * grants the prompt gets the accurate one.
 */
export async function approximateLocation(): Promise<{ lat: number; lon: number } | null> {
  const store = await headers();
  const lat = Number(store.get("x-vercel-ip-latitude"));
  const lon = Number(store.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // 0,0 is in the Atlantic and is what a missing lookup often reads as.
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}
