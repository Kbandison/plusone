import "server-only";

import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";

/**
 * A Google access token with no key anywhere.
 *
 * Google blocks service-account key creation by default on new organisations
 * now — `iam.managed.disableServiceAccountKeyCreation`, part of Secure by
 * Default — and rather than turn that off, this federates. Vercel signs a
 * short-lived OIDC token naming this project and environment, Google's workload
 * identity pool trusts that issuer, and the resulting credentials impersonate a
 * service account. Nothing long-lived exists to leak, rotate, or commit.
 *
 * The five values below are identifiers rather than secrets, which is the whole
 * point: there is no `GCP_PRIVATE_KEY` to sit in an env var and no JSON file to
 * be caught by `no-committed-credentials.test.ts`.
 *
 * ── two things that took a while to establish ───────────────────────────────
 *
 * Vercel's own GCP guide says to grant the pool principal
 * `roles/iam.serviceAccountUser`. That does NOT permit `generateAccessToken`,
 * which is what impersonation calls — it needs `roles/iam.workloadIdentityUser`.
 * Granted the wrong one, every console screen reads as configured and the
 * exchange 403s. `iamcredentials.googleapis.com` must also be enabled on the
 * project, or the same call fails with an auth error that never names an API.
 *
 * And `getVercelOidcToken()` takes no arguments in @vercel/oidc 3.8.5, despite
 * the documented `{ audience }` option. So the pool provider has to be
 * configured with **Allowed audiences** (`https://vercel.com/<team-slug>`)
 * rather than GCP's default audience, because there is no way to ask for a
 * token addressed to anything else.
 */

/** What Play's own API wants. Nothing here needs a wider grant. */
export const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export interface GoogleAuthConfig {
  readonly projectId: string;
  readonly projectNumber: string;
  readonly serviceAccountEmail: string;
  readonly poolId: string;
  readonly providerId: string;
}

/**
 * Null rather than a throw when unset, the same shape `apnsConfig()` uses.
 *
 * A deployment without these should behave as though Play billing is simply
 * not available, not crash a page that happens to import this.
 */
export function googleAuthConfig(): GoogleAuthConfig | null {
  const projectId = process.env["GCP_PROJECT_ID"];
  const projectNumber = process.env["GCP_PROJECT_NUMBER"];
  const serviceAccountEmail = process.env["GCP_SERVICE_ACCOUNT_EMAIL"];
  const poolId = process.env["GCP_WORKLOAD_IDENTITY_POOL_ID"];
  const providerId = process.env["GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"];
  if (!projectId || !projectNumber || !serviceAccountEmail || !poolId || !providerId) return null;
  return { projectId, projectNumber, serviceAccountEmail, poolId, providerId };
}

/**
 * An access token for the impersonated service account.
 *
 * Not cached. The library holds its own short-lived token internally and a
 * Vercel function is short-lived too, so a cache here would mostly be a way to
 * hand a stale token to the one invocation that outlived it — the opposite
 * trade from `providerToken()` in apns-transport.ts, which caches precisely
 * because Apple rate-limits minting.
 */
export async function googleAccessToken(
  scope: string = ANDROID_PUBLISHER_SCOPE,
): Promise<string | null> {
  const config = googleAuthConfig();
  if (!config) return null;

  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience:
      `//iam.googleapis.com/projects/${config.projectNumber}` +
      `/locations/global/workloadIdentityPools/${config.poolId}/providers/${config.providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
      `${config.serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: getVercelOidcToken },
    scopes: [scope],
  });
  if (!client) return null;

  try {
    const { token } = await client.getAccessToken();
    return token ?? null;
  } catch (cause) {
    // §9.6 — the reason, never the token or the assertion behind it.
    console.error(
      JSON.stringify({
        at: "google.auth",
        problem: cause instanceof Error ? cause.message : "unknown",
      }),
    );
    return null;
  }
}
