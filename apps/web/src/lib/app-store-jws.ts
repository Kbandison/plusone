/**
 * Apple's signature over a transaction, checked here and trusted nowhere else.
 *
 * `native-iap.ts` says it plainly: nothing on the client decides who is
 * premium. What arrives from the shell is a JWS — a signed statement from Apple
 * that a purchase happened — and a member's device is the last place on earth
 * that should be believed about its own entitlements. Anyone can post JSON to a
 * server action. The only thing separating a real purchase from a claim is that
 * one of them carries a signature chaining to Apple's root and the other does
 * not.
 *
 * ── why this is done offline ────────────────────────────────────────────────
 *
 * There is an App Store Server API that will answer questions about a
 * transaction, and it needs a private key from App Store Connect, and it is a
 * network round trip on the path of somebody who has just paid. None of that is
 * required: Apple signs the transaction, the signature is self-contained, and
 * `x5c` carries the whole chain. Verifying it needs one embedded root
 * certificate and no credentials at all.
 *
 * ── the shape of a JWS, and where the trust actually comes from ─────────────
 *
 * `header.payload.signature`, base64url, exactly like the APNs token in
 * apns-transport.ts — but read in the opposite direction. There we sign with a
 * key we hold; here we verify with a key the message hands us, which is only
 * worth anything because the chain it comes in ends at a certificate we already
 * trust and did not get from the message.
 *
 * The header's `x5c` is [leaf, intermediate, root]. Checking the signature with
 * the leaf's public key proves nothing on its own — an attacker generates their
 * own leaf and signs whatever they like. The verification that matters is the
 * chain: the leaf is signed by the intermediate, the intermediate by the root,
 * and the root is byte-for-byte the Apple Root CA - G3 embedded below. Skip
 * that last comparison and the whole thing degrades into "this JSON came with a
 * signature", which every forgery also does.
 */
import { X509Certificate, verify } from "node:crypto";

/**
 * Apple Root CA - G3, the anchor for App Store transaction signatures.
 *
 * Embedded rather than fetched, because a root downloaded at runtime is a root
 * an attacker on the network gets to choose. Downloaded once from
 * https://www.apple.com/certificateauthority/AppleRootCA-G3.cer and pinned by
 * fingerprint below — the fingerprint was confirmed against a third-party
 * certificate archive rather than only against the site it came from, which is
 * the whole point of checking a fingerprint.
 *
 * Not in Mozilla's CA bundle, so there is no system trust store on Linux to
 * fall back to. Valid to 2039-04-30.
 */
const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/**
 * The same certificate said a second way.
 *
 * Comparing the chain's root against the PEM above already settles it. This is
 * here so that swapping the PEM for a different certificate — the one edit that
 * would silently disarm every check in this file — fails a test rather than
 * passing review. Confirmed against an independent archive, not only against
 * apple.com.
 */
export const APPLE_ROOT_CA_G3_SHA256 =
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";

/** Ours, and the same identifier Android uses. A transaction for anything else is not ours. */
export const BUNDLE_ID = "app.loveplusone";

/**
 * What Apple puts in a signed transaction. Only the fields this app reads.
 *
 * Dates are milliseconds since the epoch, which is Apple's choice and not the
 * seconds a JWT would use — the same trap `apns.test.ts` pins from the other
 * direction.
 */
export interface AppStoreTransaction {
  readonly transactionId: string;
  readonly originalTransactionId: string;
  readonly bundleId: string;
  readonly productId: string;
  readonly purchaseDate: number;
  readonly expiresDate?: number;
  readonly revocationDate?: number;
  readonly revocationReason?: number;
  /** The member's id, sent at purchase. Absent means it cannot be bound to anyone. */
  readonly appAccountToken?: string;
  readonly type?: string;
  readonly environment?: "Sandbox" | "Production";
  readonly inAppOwnershipType?: string;
}

export class JwsError extends Error {}

const b64url = (segment: string): Buffer => Buffer.from(segment, "base64url");

export interface VerifyOptions {
  now?: number;
  bundleId?: string;
  /**
   * The anchor. Defaults to Apple's and every caller in this app leaves it
   * alone — it is a parameter because the happy path is otherwise untestable:
   * a chain ending at Apple's root can only be produced by Apple, so proving
   * that a GOOD signature is accepted needs a chain we made. The property that
   * matters is that the default is Apple's, and `app-store-jws.test.ts` asserts
   * exactly that by fingerprint, so a test root cannot quietly become the real
   * one.
   */
  rootPem?: string;
}

/**
 * The signature and the chain, and nothing about what the payload MEANS.
 *
 * Split out because Apple signs more than one shape with the same chain: a
 * transaction, a renewal info, and the envelope a server notification arrives
 * in — which carries its own signed transaction inside it, so this runs twice
 * on one delivery. Only the cryptography is shared; each caller checks its own
 * fields, because "is this signed by Apple" and "is this about us" are
 * different questions and answering them in one function is how the second one
 * gets skipped for a payload shape that has no bundleId at the top level.
 *
 * `now` is injectable so the tests can stand at a moment when a certificate is
 * valid — a fixture generated today would otherwise start failing the day its
 * leaf expires, which is a test that breaks on a calendar rather than on a bug.
 */
export function verifyAppleJws<T>(
  jws: string,
  { now = Date.now(), rootPem = APPLE_ROOT_CA_G3 }: VerifyOptions = {},
): T {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new JwsError("not a compact JWS");
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

  let header: { alg?: string; x5c?: string[] };
  try {
    header = JSON.parse(b64url(rawHeader).toString("utf8")) as typeof header;
  } catch {
    throw new JwsError("unreadable header");
  }

  // ES256 and nothing else. `alg: "none"` is the oldest JWT attack there is,
  // and accepting whatever the message asks for is how it works.
  if (header.alg !== "ES256") throw new JwsError(`unexpected alg ${String(header.alg)}`);

  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) throw new JwsError("no certificate chain");

  let chain: X509Certificate[];
  try {
    chain = x5c.map((der) => new X509Certificate(Buffer.from(der, "base64")));
  } catch {
    throw new JwsError("unparseable certificate in chain");
  }

  // ── the root is ours, not theirs ──────────────────────────────────────────
  //
  // The chain arrives with its own root attached, which proves nothing: a
  // forger supplies a self-consistent chain from their own root and every
  // signature in it verifies. So the last certificate is compared against the
  // one embedded above, and it is the comparison the rest of this rests on.
  const root = new X509Certificate(rootPem);
  const presentedRoot = chain[chain.length - 1]!;
  if (presentedRoot.fingerprint256 !== root.fingerprint256) {
    throw new JwsError("chain does not end at Apple's root");
  }

  // ── every link, and every certificate still in date ───────────────────────
  for (const [i, cert] of chain.entries()) {
    if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) {
      throw new JwsError(`certificate ${i} is not valid at this time`);
    }
    const issuer = chain[i + 1];
    if (!issuer) break;
    // `cert.checkIssued(issuer)`, and the direction is worth pausing on: the
    // method asks whether THIS certificate was issued by the argument, so the
    // reversed form reads just as naturally and quietly rejects every valid
    // chain. It compares names and identifiers; verify() checks the signature
    // itself. Both, because the first is a claim and the second is proof.
    if (!cert.checkIssued(issuer) || !cert.verify(issuer.publicKey)) {
      throw new JwsError(`certificate ${i} is not signed by the next in the chain`);
    }
  }

  // ── and finally the payload itself ────────────────────────────────────────
  //
  // Raw r||s, not DER — the same encoding apns.ts has to produce. Node's
  // default for an EC key is DER, and reading a JOSE signature as DER simply
  // returns false, which would read here as "forged" rather than "wrong flag".
  // `.publicKey` is already a public KeyObject. Passing it through
  // createPublicKey() throws "Invalid key object type public, expected
  // private" — that function exists to DERIVE a public key from a private one.
  const leafKey = chain[0]!.publicKey;
  const signed = Buffer.from(`${rawHeader}.${rawPayload}`);
  if (
    !verify("sha256", signed, { key: leafKey, dsaEncoding: "ieee-p1363" }, b64url(rawSignature))
  ) {
    throw new JwsError("signature does not verify");
  }

  try {
    return JSON.parse(b64url(rawPayload).toString("utf8")) as T;
  } catch {
    throw new JwsError("unreadable payload");
  }
}

/**
 * A signed transaction, verified and then checked for being ours.
 *
 * The second half is not a formality. Apple's root anchors every app on the
 * store, so a transaction bought in somebody else's app is every bit as validly
 * signed as one bought in this one — without the bundleId check it would grant
 * premium here.
 */
export function verifyAppStoreJws(
  jws: string,
  { bundleId = BUNDLE_ID, ...rest }: VerifyOptions = {},
): AppStoreTransaction {
  const payload = verifyAppleJws<AppStoreTransaction>(jws, rest);

  if (payload.bundleId !== bundleId) {
    throw new JwsError(`transaction is for ${String(payload.bundleId)}`);
  }
  if (!payload.originalTransactionId || !payload.productId) {
    throw new JwsError("transaction is missing its identifiers");
  }

  return payload;
}

/**
 * Apple's transaction mapped onto the three statuses `iap_entitlements` knows.
 *
 * Here rather than beside the server action because a `"use server"` module may
 * only export async functions, so anything sync in one is unreachable from a
 * test — and the ORDER of these two checks is the part most worth testing.
 *
 * Revocation first. A refund or a chargeback takes access immediately and
 * leaves `expiresDate` untouched, so asking about the clock first keeps a
 * refunded member premium for the rest of a term they no longer paid for. The
 * `iap_entitlements_known_status` constraint exists around exactly that case,
 * and this is the code path that would otherwise walk into it.
 */
export function entitlementStatusOf(
  transaction: AppStoreTransaction,
  now: number,
): "active" | "expired" | "revoked" {
  if (transaction.revocationDate) return "revoked";
  if (!transaction.expiresDate || transaction.expiresDate <= now) return "expired";
  return "active";
}
