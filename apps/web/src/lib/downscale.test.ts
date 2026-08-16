import { describe, expect, it } from "vitest";

import { downscalePhoto, isTooLargeToSend } from "./downscale";
import { MAX_EDGE_PX, MAX_UPLOAD_BYTES } from "./photo-limits";

/**
 * The browser-side downscale.
 *
 * Its job is to stop a 15MB phone photo being carried across mobile data so the
 * server can shrink it to 1600px — and to stop it being refused outright by the
 * Server Action body cap on the way.
 *
 * The property that actually matters is that it NEVER makes things worse. It is
 * a convenience, not a check: every branch has to return a usable File, because
 * the server is what validates and the server is what strips metadata. jsdom
 * has no createImageBitmap and no canvas encoder, so what runs here is the
 * fallback path — which is exactly the path that has to be safe.
 */

const fileOf = (bytes: number, type = "image/jpeg") =>
  new File([new Uint8Array(bytes)], "photo.jpg", { type });

describe("downscaling before upload", () => {
  it("leaves a small photo alone", async () => {
    const small = fileOf(64 * 1024);
    const result = await downscalePhoto(small);
    expect(result.file).toBe(small);
    expect(result.downscaled).toBe(false);
  });

  it("returns the original rather than throwing when the browser cannot decode", async () => {
    // The HEIC-in-Chrome case, and every other decode failure. The server has
    // the real answer and the real error message.
    const big = fileOf(3 * 1024 * 1024);
    const result = await downscalePhoto(big);
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.size).toBeGreaterThan(0);
  });

  it("always yields a File, whatever it is given", async () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      const result = await downscalePhoto(fileOf(2 * 1024 * 1024, type));
      expect(result.file, type).toBeInstanceOf(File);
    }
  });

  it("knows what is too large to send at all", () => {
    expect(isTooLargeToSend(fileOf(MAX_UPLOAD_BYTES + 1))).toBe(true);
    expect(isTooLargeToSend(fileOf(MAX_UPLOAD_BYTES))).toBe(false);
    expect(isTooLargeToSend(fileOf(500 * 1024))).toBe(false);
  });

  it("shrinks to the same edge the server would", () => {
    // Two copies of this number would mean the browser shrinking to one size
    // and the server to another, with only the second one true.
    expect(MAX_EDGE_PX).toBe(1600);
  });
});
