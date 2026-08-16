import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_UPLOAD_BYTES } from "./photo-limits";

/**
 * Three limits govern one upload, and they have to agree.
 *
 *   · photo-limits.ts — what the app tells the member is acceptable
 *   · next.config.ts  — what the framework will accept into a Server Action
 *   · the photos bucket — what storage will keep
 *
 * They did not. The app and the bucket both said 8 MB; Next's Server Action
 * body cap is 1 MB unless configured, and it was not. So a photo from any phone
 * passed both of our checks and was refused before our code ran, and the member
 * was shown a framework error rather than anything this product wrote.
 *
 * The failure is silent in the worst way: every check we own says yes.
 */

const CONFIG = readFileSync(join(import.meta.dirname, "../../next.config.ts"), "utf8");
const STORAGE = readFileSync(
  join(import.meta.dirname, "../../../../supabase/migrations/20260814000400_storage.sql"),
  "utf8",
);

/** `8 * 1024 * 1024 + 256 * 1024` as written in the config. */
function configuredBodyLimit(): number {
  const match = /bodySizeLimit:\s*([^,\n]+)/.exec(CONFIG);
  expect(match, "next.config.ts sets no bodySizeLimit — the default is 1 MB").not.toBeNull();
  const expression = match![1]!.trim();
  expect(expression, "bodySizeLimit is a string; this test expects bytes").toMatch(/^[\d\s*+]+$/);
  return Number(new Function(`return ${expression}`)());
}

describe("the three upload limits", () => {
  it("lets the framework accept everything the app accepts", () => {
    expect(configuredBodyLimit()).toBeGreaterThanOrEqual(MAX_UPLOAD_BYTES);
  });

  it("leaves room for multipart overhead on top of the file", () => {
    // The cap is on the raw body: boundaries, part headers and field metadata
    // all count. A limit set exactly at MAX_UPLOAD_BYTES rejects a file of
    // exactly MAX_UPLOAD_BYTES.
    expect(configuredBodyLimit() - MAX_UPLOAD_BYTES).toBeGreaterThanOrEqual(20 * 1024);
  });

  it("lets storage keep everything the app accepts", () => {
    const limits = [
      ...STORAGE.matchAll(/'(?:photos|verification-selfies)',\s*false,\s*(\d+)/g),
    ].map((match) => Number(match[1]));
    expect(limits.length, "no bucket size limits found — the seed shape changed").toBeGreaterThan(
      0,
    );
    for (const limit of limits) {
      expect(limit).toBeGreaterThanOrEqual(MAX_UPLOAD_BYTES);
    }
  });

  it("is the limit the member is actually told about", () => {
    expect(MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
  });
});
