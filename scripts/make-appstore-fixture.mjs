#!/usr/bin/env node
/**
 * Builds the certificate chain and signed transactions that app-store-jws.test
 * runs against.
 *
 * The awkwardness this solves: the happy path needs a JWS whose chain ends at a
 * root the verifier trusts, and the root the verifier trusts is Apple's, and
 * producing one of those is exactly the thing nobody can do. So the tests use a
 * chain generated here and pass its root in explicitly, plus one test asserting
 * that the DEFAULT root is Apple's — which is the property that actually
 * matters and the one a test-only root could otherwise hide.
 *
 * Committed as a fixture rather than generated per run, so the suite needs no
 * openssl and takes no seconds. Certificates are dated 100 years out and every
 * test pins `now`, so this does not start failing on a calendar.
 *
 * Regenerate:  node scripts/make-appstore-fixture.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { X509Certificate, createSign } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "apps", "web", "src", "lib", "app-store-jws.fixture.json");

const dir = mkdtempSync(path.join(tmpdir(), "appstore-fixture-"));
const at = (f) => path.join(dir, f);
const openssl = (...args) =>
  execFileSync("openssl", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });

const DAYS = "36500"; // ~100 years. The tests pin `now` regardless.

try {
  // ── root ──────────────────────────────────────────────────────────────────
  openssl("ecparam", "-genkey", "-name", "prime256v1", "-noout", "-out", at("root.key"));
  openssl(
    "req",
    "-x509",
    "-new",
    "-key",
    at("root.key"),
    "-sha256",
    "-days",
    DAYS,
    "-subj",
    "/CN=Plus One Test Root",
    "-out",
    at("root.pem"),
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
  );

  // ── intermediate, signed by the root ──────────────────────────────────────
  openssl("ecparam", "-genkey", "-name", "prime256v1", "-noout", "-out", at("int.key"));
  openssl(
    "req",
    "-new",
    "-key",
    at("int.key"),
    "-subj",
    "/CN=Plus One Test Intermediate",
    "-out",
    at("int.csr"),
  );
  writeFileSync(
    at("int.ext"),
    "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n",
  );
  openssl(
    "x509",
    "-req",
    "-in",
    at("int.csr"),
    "-CA",
    at("root.pem"),
    "-CAkey",
    at("root.key"),
    "-CAcreateserial",
    "-days",
    DAYS,
    "-sha256",
    "-extfile",
    at("int.ext"),
    "-out",
    at("int.pem"),
  );

  // ── leaf, signed by the intermediate ──────────────────────────────────────
  openssl("ecparam", "-genkey", "-name", "prime256v1", "-noout", "-out", at("leaf.key"));
  openssl(
    "req",
    "-new",
    "-key",
    at("leaf.key"),
    "-subj",
    "/CN=Plus One Test Leaf",
    "-out",
    at("leaf.csr"),
  );
  openssl(
    "x509",
    "-req",
    "-in",
    at("leaf.csr"),
    "-CA",
    at("int.pem"),
    "-CAkey",
    at("int.key"),
    "-CAcreateserial",
    "-days",
    DAYS,
    "-sha256",
    "-out",
    at("leaf.pem"),
  );

  // ── a second, UNRELATED root and leaf ─────────────────────────────────────
  //
  // For the test that matters most: a chain that is internally perfect and
  // anchored somewhere else. This is what a forgery looks like, and every
  // signature in it verifies.
  openssl("ecparam", "-genkey", "-name", "prime256v1", "-noout", "-out", at("evil-root.key"));
  openssl(
    "req",
    "-x509",
    "-new",
    "-key",
    at("evil-root.key"),
    "-sha256",
    "-days",
    DAYS,
    "-subj",
    "/CN=Somebody Elses Root",
    "-out",
    at("evil-root.pem"),
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
  );
  openssl("ecparam", "-genkey", "-name", "prime256v1", "-noout", "-out", at("evil-leaf.key"));
  openssl(
    "req",
    "-new",
    "-key",
    at("evil-leaf.key"),
    "-subj",
    "/CN=Somebody Elses Leaf",
    "-out",
    at("evil-leaf.csr"),
  );
  openssl(
    "x509",
    "-req",
    "-in",
    at("evil-leaf.csr"),
    "-CA",
    at("evil-root.pem"),
    "-CAkey",
    at("evil-root.key"),
    "-CAcreateserial",
    "-days",
    DAYS,
    "-sha256",
    "-out",
    at("evil-leaf.pem"),
  );

  const der = (pem) =>
    readFileSync(at(pem), "utf8")
      .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
      .replace(/\s+/g, "");

  const b64url = (buf) => Buffer.from(buf).toString("base64url");

  /** ES256 over `header.payload`, in the raw r||s JOSE wants rather than DER. */
  function sign(keyFile, header, payload) {
    const signing = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signer = createSign("sha256");
    signer.update(signing);
    const sig = signer.sign({
      key: readFileSync(at(keyFile), "utf8"),
      dsaEncoding: "ieee-p1363",
    });
    return `${signing}.${b64url(sig)}`;
  }

  const CHAIN = [der("leaf.pem"), der("int.pem"), der("root.pem")];
  const head = (x5c) => ({ alg: "ES256", x5c });

  // The moment every test stands at, taken FROM the chain rather than written
  // down. A hardcoded date is wrong the moment this is regenerated: the
  // certificates start being valid today, so any timestamp chosen in advance is
  // either before they exist or drifts away from them. A day after the leaf
  // becomes valid is always inside every certificate's window.
  const NOW = Date.parse(new X509Certificate(readFileSync(at("leaf.pem"))).validFrom) + 86_400_000;
  const MEMBER = "11111111-2222-3333-4444-555555555555";

  const base = {
    transactionId: "2000000900000001",
    originalTransactionId: "2000000800000001",
    bundleId: "app.loveplusone",
    productId: "3months",
    purchaseDate: NOW - 86_400_000,
    expiresDate: NOW + 90 * 86_400_000,
    appAccountToken: MEMBER,
    type: "Auto-Renewable Subscription",
    environment: "Sandbox",
    inAppOwnershipType: "PURCHASED",
  };

  const fixture = {
    note: "Generated by scripts/make-appstore-fixture.mjs. Not Apple's — see the test.",
    now: NOW,
    member: MEMBER,
    testRootPem: readFileSync(at("root.pem"), "utf8").trim(),
    otherRootPem: readFileSync(at("evil-root.pem"), "utf8").trim(),

    valid: sign("leaf.key", head(CHAIN), base),
    expired: sign("leaf.key", head(CHAIN), { ...base, expiresDate: NOW - 86_400_000 }),
    revoked: sign("leaf.key", head(CHAIN), {
      ...base,
      revocationDate: NOW - 3_600_000,
      revocationReason: 1,
    }),
    noAccountToken: sign("leaf.key", head(CHAIN), { ...base, appAccountToken: undefined }),
    otherBundle: sign("leaf.key", head(CHAIN), { ...base, bundleId: "com.someone.else" }),
    production: sign("leaf.key", head(CHAIN), { ...base, environment: "Production" }),
    sixMonths: sign("leaf.key", head(CHAIN), { ...base, productId: "6months" }),

    // Internally consistent, anchored to a root nobody trusts.
    forged: sign("evil-leaf.key", head([der("evil-leaf.pem"), der("evil-root.pem")]), base),
    // Right chain, wrong signer: the leaf is Apple's-test-chain but the bytes
    // were signed by a key that has nothing to do with it.
    wrongSigner: sign("evil-leaf.key", head(CHAIN), base),
    // alg: none, the oldest trick there is.
    algNone: `${b64url(JSON.stringify({ alg: "none", x5c: CHAIN }))}.${b64url(JSON.stringify(base))}.`,
  };

  // ── server notifications ──────────────────────────────────────────────────
  //
  // Apple POSTs an envelope JWS whose payload carries ANOTHER JWS. Both chain
  // to the same root, so both are signed here, and the tests can then check
  // that a genuine envelope around a forged transaction is still refused.
  const envelope = (type, over = {}, tx = base) =>
    sign("leaf.key", head(CHAIN), {
      notificationType: type,
      notificationUUID: `uuid-${type}`,
      ...over,
      data: {
        bundleId: "app.loveplusone",
        environment: "Sandbox",
        signedTransactionInfo: sign("leaf.key", head(CHAIN), tx),
        ...(over.data ?? {}),
      },
    });

  fixture.notifications = {
    didRenew: envelope("DID_RENEW"),
    subscribed: envelope("SUBSCRIBED"),
    // The renewal payment failed and Apple is retrying. The transaction still
    // carries the OLD, PASSED expiry — reading it alone locks somebody out.
    gracePeriod: envelope(
      "DID_FAIL_TO_RENEW",
      { subtype: "GRACE_PERIOD" },
      {
        ...base,
        expiresDate: NOW - 3_600_000,
      },
    ),
    failedNoGrace: envelope("DID_FAIL_TO_RENEW", {}, { ...base, expiresDate: NOW - 3_600_000 }),
    gracePeriodExpired: envelope(
      "GRACE_PERIOD_EXPIRED",
      {},
      { ...base, expiresDate: NOW - 3_600_000 },
    ),
    expired: envelope("EXPIRED", {}, { ...base, expiresDate: NOW - 86_400_000 }),
    // A refund with WEEKS still on the clock. The case a date comparison alone
    // gets wrong.
    refund: envelope("REFUND", {}, { ...base, expiresDate: NOW + 60 * 86_400_000 }),
    revoke: envelope("REVOKE", {}, { ...base, expiresDate: NOW + 60 * 86_400_000 }),
    // Auto-renew switched off. They keep what they paid for.
    renewalStatusChanged: envelope("DID_CHANGE_RENEWAL_STATUS", { subtype: "AUTO_RENEW_DISABLED" }),
    priceIncrease: envelope("PRICE_INCREASE"),
    // App Store Connect's own button. No data at all.
    test: sign("leaf.key", head(CHAIN), {
      notificationType: "TEST",
      notificationUUID: "uuid-test",
    }),
    otherBundle: envelope("DID_RENEW", { data: { bundleId: "com.someone.else" } }),
    // Genuine envelope, forged transaction inside it.
    forgedInner: sign("leaf.key", head(CHAIN), {
      notificationType: "DID_RENEW",
      data: {
        bundleId: "app.loveplusone",
        environment: "Sandbox",
        signedTransactionInfo: sign(
          "evil-leaf.key",
          head([der("evil-leaf.pem"), der("evil-root.pem")]),
          base,
        ),
      },
    }),
  };

  writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
