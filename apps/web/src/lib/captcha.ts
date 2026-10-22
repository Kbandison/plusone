/**
 * The CAPTCHA token's trip from the widget to Supabase.
 *
 * Shared by the client widget and the server actions, so the name the widget
 * writes and the name the action reads cannot drift apart — a mismatch would
 * send no token, and with Supabase's CAPTCHA switched on that refuses every
 * code in the app with nothing on screen saying why.
 *
 * Turnstile's own default, so the hidden input it injects inside the form is
 * picked up by FormData with no wiring of ours.
 */
export const CAPTCHA_FIELD = "cf-turnstile-response";

/**
 * The token as a `signInWithOtp` option, to spread into `options`.
 *
 * EMPTY when there is no token, rather than `captchaToken: undefined` — the
 * repo's `exactOptionalPropertyTypes` refuses the second, and leaving the key
 * out is what it means anyway: no token in the request, which Supabase accepts
 * while its CAPTCHA is off and answers `captcha_failed` once it is on.
 */
export function captchaTokenOption(formData: FormData): { captchaToken?: string } {
  const token = formData.get(CAPTCHA_FIELD);
  return typeof token === "string" && token.length > 0 ? { captchaToken: token } : {};
}
