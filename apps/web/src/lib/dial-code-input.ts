/**
 * When a suggested dialling code should appear in a field that takes either a
 * phone number or an email address.
 *
 * `/onboarding/phone` can simply prefill: that field is a phone number and
 * nothing else. `/sign-in` cannot. Its one field accepts both — "the field
 * takes either, and a keyboard or a validator committed to one of them fights
 * whichever the member brought" — so a "+1" sitting there on arrival is a
 * character every member signing in with an address has to delete first.
 *
 * So the code appears at the moment the input stops being ambiguous. A first
 * character that is a digit is the start of a phone number and nothing else; no
 * email address begins with one. Until then the field is left alone.
 *
 * Only on the transition FROM EMPTY, which is what makes this safe to run on
 * every keystroke: after "7" has become "+17" the field is no longer empty, so
 * the rest of the number is typed without interference. It also means a pasted
 * number gets the code too — paste is how a number reaches this field on a
 * phone, and it arrives in one event from an empty field like any other input.
 *
 * Returns null for "leave the field exactly as it is", which is every case but
 * one. The member can still delete it: this is the same suggestion the phone
 * step makes, made later, and `normalizePhone` still refuses to invent a
 * country code for anybody who clears it.
 */
export function applyDialCode(previous: string, value: string, dialCode: string): string | null {
  // Off Vercel, or a request Vercel could not place. Nothing to suggest.
  if (!dialCode) return null;

  // Mid-entry. The member is typing their number, or their address, and either
  // way the moment to offer a country code has passed.
  if (previous !== "") return null;

  // An address, a username, or an empty field. Not ours to touch.
  if (!/^[0-9]/.test(value)) return null;

  /**
   * THEY GAVE THE COUNTRY CODE, WITHOUT THE PLUS. Add the plus; do not add the
   * code again.
   *
   * ── this cost a rejected review ─────────────────────────────────────────────
   *
   * An App Review reviewer was given the demo number as `18005550147` and put it
   * into this field. It was empty and the first character was a digit, so the
   * code went on the front: `+118005550147`. That is a different number, it has
   * no Supabase test-OTP pair behind it, so the request went to Twilio and no
   * code ever arrived. The review came back "the test number didn't work", and
   * an unconfirmed account row at +118005550147 was the receipt.
   *
   * The existing guard only caught `+44...` — a plus the member typed
   * themselves. Nobody had considered the same number without one, which is how
   * most people write their own: an American writes 1-800-555-0147.
   *
   * ── what this does NOT fix, said rather than implied ────────────────────────
   *
   * Digit-by-digit typing of a full international number, where the dial code is
   * more than one digit. A British member typing `447700900123` gets `+444` on
   * the first keystroke, because "4" does not start with "44" — and after that
   * the field is no longer empty and nothing here runs again. That was already
   * true and is not made worse; pasting the same number is now correct, and
   * paste is how a number reaches this field on a phone.
   *
   * For `+1` it is exact in both directions: no NANP national number begins with
   * a 1, so a leading 1 can only ever be the country code.
   */
  const digits = dialCode.replace(/\D/g, "");
  if (digits && value.startsWith(digits)) return `+${value}`;

  return dialCode + value;
}
