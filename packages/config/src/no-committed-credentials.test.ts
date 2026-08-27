import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Nothing tracked by git may contain a private key.
 *
 * `.gitignore` refuses the extensions signing material arrives in — .jks,
 * .keystore, .p12, .p8 — and that is a NAME check, which is the weaker kind. A
 * Google Cloud service-account key defeats it completely: it downloads as
 * ordinary JSON named after the project, `plusone-a1b2c3d4e5f6.json`, and no
 * safe glob catches that without also catching package.json.
 *
 * So this checks CONTENT instead, and content cannot be renamed around. Every
 * Google service-account key contains `"type": "service_account"` and a
 * `private_key`; every PEM private key contains its own header. A file with one
 * of those in it has no business being tracked whatever it is called.
 *
 * Worth more than tidiness. The Play Developer API key carries "manage orders
 * and subscriptions" on real money, and the upload keystore — which this repo
 * already lost once to exactly this gap, sitting untracked but unignored at the
 * root, one `git add -A` from a public remote — can publish an update to an app
 * on the phones of people whose presence here is the thing they most need kept
 * private. Neither is rotatable in an afternoon.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");

/**
 * A real key is long, and a placeholder cannot be.
 *
 * `.env.example` documents the APNS key format as
 * `-----BEGIN PRIVATE KEY-----\nxxxxxxxx\n-----END PRIVATE KEY-----`, and
 * env.sync.test.ts asserts that shape parses. Both name the header legitimately
 * and neither is a secret, so a check on the HEADER alone reports two false
 * positives on the day it is written — and a credential guard that cries wolf
 * is one somebody adds an allow-list to, which is how the real one gets allowed.
 *
 * The body is what cannot be faked small. A P-256 key is around 200 characters
 * of base64 and an RSA one nearer 1600; nothing usable fits in a hundred. So
 * the threshold sorts placeholders from keys without anybody maintaining a list
 * of which files are allowed to look dangerous.
 */
const PEM_BODY = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----([\s\S]*?)-----END/g;
const REAL_KEY_MIN = 100;

function looksLikeRealPem(text: string): boolean {
  for (const [, body] of text.matchAll(PEM_BODY)) {
    // Strip the whitespace and the literal \n an escaped one-line key carries.
    const material = (body ?? "").replace(/\\n/g, "").replace(/\s/g, "");
    if (material.length >= REAL_KEY_MIN) return true;
  }
  return false;
}

const tracked = (): string[] =>
  execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);

describe("no credential is committed", () => {
  it("finds no private key in anything git tracks", () => {
    const offenders: string[] = [];

    for (const rel of tracked()) {
      // This file names the markers in order to look for them.
      if (rel.endsWith("no-committed-credentials.test.ts")) continue;
      const full = path.join(ROOT, rel);
      let text: string;
      try {
        // A key is small. Skipping large files keeps this fast and cannot hide
        // one — nothing ships a 2 MB private key.
        if (statSync(full).size > 2_000_000) continue;
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      // A file claiming to BE a service account is damning whatever length its
      // key is — no legitimate file in this repo says `"type": "service_account"`.
      if (text.includes("service_account") && text.includes("private_key")) {
        offenders.push(`${rel} (service-account key)`);
        continue;
      }
      if (looksLikeRealPem(text)) offenders.push(`${rel} (private key)`);
    }

    expect(offenders, `credential material is tracked: ${offenders.join(", ")}`).toEqual([]);
  });

  it("still refuses the extensions a name check can catch", () => {
    // The name check is not replaced by the content one — it is the half that
    // stops a key being STAGED, where this test only fails once it already is.
    const ignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    for (const pattern of ["*.jks", "*.keystore", "*.p12", "*.p8", "secrets/"]) {
      expect(ignore).toContain(pattern);
    }
  });
});
