import { describe, expect, it } from "vitest";
import sharp from "sharp";
// @ts-expect-error — piexifjs ships no types; it is only used to BUILD a
// fixture that genuinely carries GPS EXIF.
import piexif from "piexifjs";

import { MAX_UPLOAD_BYTES, isAcceptableUpload } from "./photo-limits";
import { processPhoto } from "./photos";

/**
 * A JPEG carrying real GPS EXIF — the shape of a photo straight off a phone.
 *
 * Written with piexifjs rather than sharp's `withExif`, which silently drops a
 * GPS block: an earlier version of this fixture carried none, so the test below
 * was asserting "no GPS in the output" against an input that never had any.
 * `expectsGps` guards against that ever being true again.
 */
async function phonePhotoWithGps(): Promise<Buffer> {
  const plain = await sharp({
    create: {
      width: 900,
      height: 1200,
      channels: 3,
      background: { r: 180, g: 90, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();

  const exif = {
    "0th": {
      [piexif.ImageIFD.Make]: "Apple",
      [piexif.ImageIFD.Model]: "iPhone 15 Pro",
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [
        [37, 1],
        [46, 1],
        [2988, 100],
      ],
      [piexif.GPSIFD.GPSLongitudeRef]: "W",
      [piexif.GPSIFD.GPSLongitude]: [
        [122, 1],
        [25, 1],
        [600, 100],
      ],
    },
  };

  const binary = plain.toString("binary");
  const withGps = piexif.insert(piexif.dump(exif), binary);
  return Buffer.from(withGps, "binary");
}

/** Fails loudly if the fixture stops carrying what it is meant to carry. */
async function expectsGps(image: Buffer): Promise<void> {
  const meta = await sharp(image).metadata();
  expect(meta.exif, "fixture carries no EXIF at all").toBeDefined();
  const parsed = piexif.load(image.toString("binary"));
  expect(Object.keys(parsed.GPS ?? {}).length, "fixture carries no GPS tags").toBeGreaterThan(0);
}

describe("uploads are screened before decoding", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/heic"])("accepts %s", (type) => {
    expect(isAcceptableUpload(type, 1024)).toBe(true);
  });

  it.each(["application/pdf", "text/html", "image/svg+xml", "video/mp4", ""])(
    "rejects %s",
    (type) => {
      expect(isAcceptableUpload(type, 1024)).toBe(false);
    },
  );

  it("rejects an empty file and an oversized one", () => {
    expect(isAcceptableUpload("image/jpeg", 0)).toBe(false);
    expect(isAcceptableUpload("image/jpeg", MAX_UPLOAD_BYTES + 1)).toBe(false);
    expect(isAcceptableUpload("image/jpeg", MAX_UPLOAD_BYTES)).toBe(true);
  });
});

// The rest of the product rounds a member's location to about a kilometre and
// shows a distance rather than a point. A photo with GPS EXIF would hand out
// exact coordinates and quietly undo all of it.
describe("no metadata survives", () => {
  it("strips GPS from an uploaded phone photo", async () => {
    const source = await phonePhotoWithGps();
    await expectsGps(source);

    const { full, blurred } = await processPhoto(source);

    for (const [label, buffer] of [
      ["full", full],
      ["blurred", blurred],
    ] as const) {
      const meta = await sharp(buffer).metadata();
      expect(meta.exif, `${label} kept EXIF`).toBeUndefined();
      expect(meta.iptc, `${label} kept IPTC`).toBeUndefined();
      expect(meta.xmp, `${label} kept XMP`).toBeUndefined();
    }
  });

  it("leaves no trace of the coordinates anywhere in the output bytes", async () => {
    const source = await phonePhotoWithGps();
    await expectsGps(source);

    const { full, blurred } = await processPhoto(source);
    for (const [label, buffer] of [
      ["full", full],
      ["blurred", blurred],
    ] as const) {
      const text = buffer.toString("latin1");
      for (const trace of ["GPS", "iPhone", "Apple", "Exif"]) {
        expect(text, `${label} still contains ${trace}`).not.toContain(trace);
      }
      // No piexif.load here — it parses JPEG only, and the output is WebP.
      // sharp's metadata check in the test above is the structured assertion;
      // this one is the independent, format-agnostic sweep of the raw bytes.
    }
  });

  // Stripping EXIF without applying it first turns portrait photos sideways.
  it("applies EXIF orientation before discarding it", async () => {
    // withMetadata sets a real orientation tag; withExif writes it as a string
    // that sharp reads back as 1, which would make this test pass vacuously.
    const rotated = await sharp({
      create: {
        width: 400,
        height: 800,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(rotated).metadata()).orientation).toBe(6);

    const { width, height } = await processPhoto(rotated);
    // Orientation 6 means "rotate 90° clockwise", so a 400x800 source lands as
    // a landscape image rather than staying portrait.
    expect(width).toBeGreaterThan(height);
  });
});

/**
 * A fine checkerboard — the most high-frequency image there is, and therefore
 * the one with the most to lose. Flat colour blocks would pass the tests below
 * vacuously, because they hold almost nothing beyond a thumbnail to begin with.
 */
async function detailedPhoto(edge = 600, cell = 4): Promise<Buffer> {
  const raw = Buffer.alloc(edge * edge * 3);
  for (let y = 0; y < edge; y++) {
    for (let x = 0; x < edge; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const i = (y * edge + x) * 3;
      raw[i] = raw[i + 1] = raw[i + 2] = on ? 255 : 0;
    }
  }
  return sharp(raw, { raw: { width: edge, height: edge, channels: 3 } })
    .jpeg()
    .toBuffer();
}

describe("the blur is not reversible", () => {
  /**
   * Mean absolute difference, 0-255, between an image and itself pushed back
   * through the same 24px bottleneck. Near zero means the image already holds
   * no more information than a 24px thumbnail — which is precisely the claim.
   *
   * File size would have been the easy measurement and the wrong one: it tracks
   * how compressible an image is, not how much of it survives.
   */
  async function informationBeyondThumbnail(image: Buffer): Promise<number> {
    const size = 240;
    const flat = async (b: Buffer) =>
      sharp(b).resize(size, size, { fit: "fill" }).greyscale().raw().toBuffer();

    const original = await flat(image);
    const roundTripped = await flat(
      await sharp(image).resize(24, 24, { fit: "inside" }).png().toBuffer(),
    );

    let total = 0;
    for (let i = 0; i < original.length; i++) {
      total += Math.abs((original[i] ?? 0) - (roundTripped[i] ?? 0));
    }
    return total / original.length;
  }

  it("holds no more information than a 24px thumbnail", async () => {
    const { full, blurred } = await processPhoto(await detailedPhoto());

    // The blurred variant survives the bottleneck almost unchanged, because it
    // has already been through it. The full photo does not.
    const blurredLoss = await informationBeyondThumbnail(blurred);
    const fullLoss = await informationBeyondThumbnail(full);

    expect(blurredLoss).toBeLessThan(4);
    expect(fullLoss).toBeGreaterThan(blurredLoss * 3);
  });

  it("destroys detail rather than smoothing it", async () => {
    // Fine checkerboard detail cannot survive a 24px resample. If the blurred
    // variant still carried high-frequency information, it would mean the
    // downscale step had been dropped in favour of a plain blur.
    const { blurred } = await processPhoto(await detailedPhoto());
    const { data, info } = await sharp(blurred)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Standard deviation across the result: a checkerboard is ~127, a uniform
    // grey is ~0. Anything low means the pattern is gone.
    const pixels = data.subarray(0, info.width * info.height);
    const mean = pixels.reduce((a, v) => a + v, 0) / pixels.length;
    const sd = Math.sqrt(pixels.reduce((a, v) => a + (v - mean) ** 2, 0) / pixels.length);
    expect(sd).toBeLessThan(12);
  });

  it("produces a blurred variant that is not simply the original", async () => {
    const source = await phonePhotoWithGps();
    const { full, blurred } = await processPhoto(source);
    expect(blurred.equals(full)).toBe(false);
  });
});

describe("output", () => {
  it("is webp, whatever went in", async () => {
    const { full, blurred } = await processPhoto(await phonePhotoWithGps());
    expect((await sharp(full).metadata()).format).toBe("webp");
    expect((await sharp(blurred).metadata()).format).toBe("webp");
  });

  it("caps the long edge and never enlarges a small photo", async () => {
    const big = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .jpeg()
      .toBuffer();
    const { width, height } = await processPhoto(big);
    expect(Math.max(width, height)).toBe(1600);

    const small = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .jpeg()
      .toBuffer();
    const out = await processPhoto(small);
    expect(out.width).toBe(320);
  });

  it("refuses something that is not an image", async () => {
    await expect(processPhoto(Buffer.from("<html>not a photo</html>"))).rejects.toThrow();
  });
});

describe("the card variant", () => {
  /**
   * Every surface renders a photo at 72px or less, and the stored original is
   * 1600. These photos cannot go through a shared image optimiser — the bytes
   * behind one URL differ by viewer, and an optimiser that caches by URL would
   * let a connected viewer populate an entry a stranger then reads — so the
   * small variant is what makes serving them directly affordable.
   */
  it("is much smaller than the original", async () => {
    const source = await phonePhotoWithGps();
    const { full, card } = await processPhoto(source);
    expect(card.length).toBeLessThan(full.length);
  });

  it("is a square, so a round avatar never crops off a chin", async () => {
    const source = await phonePhotoWithGps();
    const { card } = await processPhoto(source);
    const meta = await sharp(card).metadata();
    expect(meta.width).toBe(meta.height);
  });

  it("is big enough for the largest thing that renders it", async () => {
    // 72px at 4x device pixel ratio.
    const source = await phonePhotoWithGps();
    const { card } = await processPhoto(source);
    const meta = await sharp(card).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(288);
  });

  it("is webp and carries no metadata", async () => {
    const source = await phonePhotoWithGps();
    const { card } = await processPhoto(source);
    const meta = await sharp(card).metadata();
    expect(meta.format).toBe("webp");
    // The same rule as the full variant: a card is still a photo of a face.
    expect(meta.exif).toBeUndefined();
  });

  it("is not the blurred one", async () => {
    const source = await phonePhotoWithGps();
    const { card, blurred } = await processPhoto(source);
    expect(card.equals(blurred)).toBe(false);
  });
});
