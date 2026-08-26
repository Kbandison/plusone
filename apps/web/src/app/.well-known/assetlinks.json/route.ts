/**
 * Digital Asset Links: what makes the Android app and this site one publisher.
 *
 * A Trusted Web Activity is Chrome with its address bar removed, and Chrome
 * only removes it once it has fetched this file and found its own signing
 * certificate named here. Get any of it wrong and nothing errors — the app
 * installs, launches and works, with a browser address bar across the top
 * forever. That is the entire failure mode, and it is silent, which is why
 * every value below is commented rather than left to look self-evident.
 *
 * Served as a Route Handler rather than from `public/`: Next documents
 * `.well-known` as a custom route (see the backend-for-frontend guide), and a
 * handler is the only way to be certain of the `content-type` — Chrome's
 * verifier wants `application/json` and will not accept a guess.
 */
import { NextResponse } from "next/server";

/**
 * Static, and deliberately so. Nothing here varies by request, and the default
 * for a Route Handler is dynamic — which would mean a server render every time
 * Chrome revalidates, for a file that changes when a signing key changes and
 * never otherwise.
 */
export const dynamic = "force-static";

/**
 * The same identifier as iOS, which is a decision rather than a coincidence:
 * one name across both stores, so a bundle id in a log or a crash report needs
 * no disambiguation. Confirmed against Play Console 2026-08-25.
 *
 * It cannot be changed after publishing on either store.
 */
const PACKAGE_NAME = "app.loveplusone";

/**
 * The SHA-256 of Play's APP SIGNING key — not the upload key.
 *
 * Both are shown on the same App integrity page and only this one is right:
 * Google re-signs every upload with the app signing key, so that is the
 * certificate a phone actually sees. The upload key's fingerprint is the
 * classic wrong answer here and fails exactly as silently as everything else on
 * this page.
 *
 * Regenerated 2026-08-25 when the Play app record was recreated — an earlier
 * fingerprint (FB:82:…) belongs to a record that no longer exists and must not
 * come back. A signing key is per-app, so this changes if the record is ever
 * remade again.
 */
const SHA256_CERT_FINGERPRINT =
  "FA:97:45:49:F5:D5:EB:BD:96:22:71:65:91:CF:94:AA:11:01:1C:17:9E:7D:05:0D:05:52:5A:CD:55:62:F9:4B";

export function GET() {
  return NextResponse.json(
    [
      {
        /**
         * The only relation a TWA needs. It says this app may present itself as
         * this origin — which is what lets Chrome drop the address bar.
         */
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: [SHA256_CERT_FINGERPRINT],
        },
      },
    ],
    {
      headers: {
        // Chrome's verifier is strict about this; `application/json` is not
        // negotiable and a text/plain response is treated as absent.
        "content-type": "application/json",
        // Long, because it changes when a signing key changes and never
        // otherwise — and a stale cache here only ever costs an address bar.
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
