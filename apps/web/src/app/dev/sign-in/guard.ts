/**
 * Whether the development sign-in may run.
 *
 * Pulled out as a pure function so it can be tested directly. This is a door
 * into any account: the failure mode is not a bug, it is a breach, and a guard
 * that has never been executed is a guard nobody has checked.
 *
 * Two conditions, deliberately independent. NODE_ENV alone would be one
 * mis-set variable away from open, and OTP_PROVIDER alone would open the moment
 * someone deployed a stub build to a real host.
 */
export function devSignInAllowed(nodeEnv: string | undefined, otpProvider: string): boolean {
  if (nodeEnv === "production") return false;
  if (otpProvider !== "stub") return false;
  return true;
}

export const DEV_SIGN_IN_REFUSED =
  "The development sign-in only exists outside production, with OTP_PROVIDER=stub.";
