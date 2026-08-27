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
 * The SHA-256 of every key Play signs with — and there are THREE, not one.
 *
 * Not the upload key. Both are shown on the same App integrity page and only
 * these are right: Google re-signs every upload, so these are the certificates
 * a phone actually sees. The upload key's fingerprint is the classic wrong
 * answer and fails exactly as silently as everything else here.
 *
 * ── why three ───────────────────────────────────────────────────────────────
 *
 * This app is enrolled in QUANTUM-READY HYBRID SIGNING, which combines a
 * classical RSA-4096 key with a post-quantum ML-DSA-65 one. Google's own words:
 * it "generates a new classical key for the hybrid signature that is different
 * to the classical key it uses for pre-Android 17 devices, resulting in your
 * app using three distinct keys", and "you must copy the fingerprints for three
 * keys and register each of them".
 *
 *   deployment       the original classical key — every device before Android 17
 *   hybrid classical the new classical half of the hybrid — Android 17+
 *   hybrid PQC       the ML-DSA-65 half — Android 17+
 *
 * This file carried ONLY the PQC one for two days, which is why the TWA showed
 * an address bar on a real phone: the device verified with a key that was not
 * in the list, and the failure is the silent kind — the app installs, launches
 * and works, with a browser bar across the top forever.
 *
 * Computed from the .der certificates Play exports rather than transcribed. A
 * certificate fingerprint IS the SHA-256 of its DER encoding, so `sha256sum`
 * and `openssl x509 -fingerprint -sha256` must agree, and both were checked —
 * openssl cannot parse ML-DSA-65 on every build, and the raw hash can.
 *
 * These change only if the Play record is remade. An earlier fingerprint
 * (FB:82:…) belongs to a record that no longer exists and must not come back.
 */
const SHA256_CERT_FINGERPRINTS = [
  // deployment — pre-Android 17
  "3E:F7:EE:66:13:37:FD:F7:93:59:1D:79:36:F8:AD:49:5C:0F:6D:5C:6E:78:F0:4B:E3:85:0B:70:0E:5D:3D:0A",
  // hybrid classical — Android 17+
  "39:27:51:17:95:CB:76:90:DC:B8:F8:F2:10:87:8D:01:35:5C:C8:42:F2:82:28:F7:89:07:47:13:0A:12:22:12",
  // hybrid post-quantum, ML-DSA-65 — Android 17+
  "FA:97:45:49:F5:D5:EB:BD:96:22:71:65:91:CF:94:AA:11:01:1C:17:9E:7D:05:0D:05:52:5A:CD:55:62:F9:4B",
];

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
          sha256_cert_fingerprints: SHA256_CERT_FINGERPRINTS,
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
