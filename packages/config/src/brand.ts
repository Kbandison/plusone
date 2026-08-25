/**
 * Brand constants. Decision #1 locks the name; Kevin locked "Plus One everywhere"
 * in user-facing copy on 2026-08-13, so the full name survives only as the domain,
 * the store listing, and the legal entity.
 *
 * No component may hardcode a brand string. Import from here.
 */

export const BRAND = {
  /** Spoken, written, and in-app product name. Used in ALL user-facing copy. */
  name: "Plus One",
  /** Wordmark: small superscript plus set tight against a large "One". */
  wordmark: "⁺One",
  /** Device display name, with a fallback for platforms that mangle superscripts. */
  deviceName: "⁺One",
  deviceNameFallback: "PlusOne",
  /**
   * Store listing and legal entity name only — never rendered in the UI.
   *
   * Confirmed by Kevin 2026-08-25, on enrolling in the Apple Developer Program:
   * the entity is LuxWeb Studio LLC and the app is PlusOne. That is the pair the
   * A2P brand was registered under, which the previous note here had guessed at
   * and deliberately refused to write down.
   *
   * It was "YourPlusOne" until now — derived from yourplusone.app, a domain that
   * was never bought. Harmless while nothing rendered it, and no longer: an App
   * Store listing carries the seller's legal entity publicly, so this is the
   * name that will appear beside the app.
   */
  legalName: "LuxWeb Studio LLC",
  /** Secured 2026-08-17. Was yourplusone.app, which was never bought. */
  domain: "loveplusone.app",
  supportEmail: "hello@loveplusone.app",
} as const;

/**
 * The external pitch. Decision: never explain more than this externally.
 */
export const PITCH =
  "Dating with the talk already handled. Real people, real privacy, nobody gets ghosted." as const;

/**
 * Voice guardrails from §3.2, kept here so tone-check and review tooling can read them.
 * These describe copy that must NEVER ship — see also packages/logic/tone.
 */
export const BANNED_COPY_TERMS = [
  "sufferers",
  "victims",
  "afflicted",
  "despite your status",
  "clean",
  "infected",
] as const;

/**
 * Precision rules for privacy language (§3.2). We say "private", never "encrypted"
 * or "anonymous" — E2EE is explicitly out for v1 (Decision #29) and claiming it would be false.
 */
export const BANNED_PRIVACY_CLAIMS = ["encrypted", "anonymous", "guaranteed"] as const;
