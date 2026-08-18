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

  return dialCode + value;
}
