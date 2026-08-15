/**
 * Coercing a config value from the database.
 *
 * Extracted from tunables.ts so it can be tested. It is the riskiest code in
 * the app layer precisely because it CANNOT throw: config that breaks the
 * product when it is wrong is not config, it is a deployment. Everything
 * unusable falls back to the compiled default.
 *
 * Which means a bug here is silent by design — the Drop would keep working with
 * the wrong numbers and nothing would say so. That is the argument for testing
 * it rather than trusting it.
 */

/**
 * A finite number, or the fallback.
 *
 * jsonb round-trips as a string through some clients and as a number through
 * others, so both are accepted. Everything else — null, booleans, objects,
 * arrays, empty strings, NaN, Infinity — is not a number a mechanic can use.
 */
export function configNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const raw = config[key];

  // Deliberately not Number(raw) on anything: Number(null) is 0, Number([]) is
  // 0, and Number(true) is 1. A missing radius silently becoming zero is worse
  // than a missing radius.
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : fallback;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}
