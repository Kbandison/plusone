// Never reachable from a client component: sharp is a native library, and
// importing it into a browser bundle fails the build with an error that points
// at detect-libc rather than at the import that caused it.
import "server-only";
import sharp from "sharp";

/**
 * Photo processing (Decision #19, §4.2).
 *
 * Two properties this module exists to guarantee:
 *
 *   1. NO METADATA SURVIVES. A phone photo carries EXIF, and EXIF carries GPS.
 *      Storing that would hand out a member's exact coordinates while the rest
 *      of the product goes to the trouble of rounding their location to about a
 *      kilometre and showing a distance instead of a point. sharp drops
 *      metadata unless asked to keep it, and this never asks — but the test
 *      asserts a stripped result rather than trusting the default, because a
 *      default is a thing that can change.
 *
 *   2. THE BLUR IS NOT REVERSIBLE. A gaussian blur over a full-resolution image
 *      only hides information; deconvolution can bring some of it back. So the
 *      blurred variant is RESAMPLED DOWN to a thumbnail first — which destroys
 *      the data rather than obscuring it — and only then blurred and scaled
 *      back up. There is nothing left to recover because it was thrown away.
 *
 * The blurred variant is a separate stored object, not a CSS filter and not a
 * transform applied on read. §5.3 and the privacy policy both say the blur
 * happens before the image is sent; a filter in the browser would mean shipping
 * the real photo to someone who has not connected, and would make that sentence
 * false.
 */

/** Longest edge of the stored photo. Enough for a full-bleed phone screen. */
const MAX_EDGE = MAX_EDGE_PX;

/**
 * Longest edge of the intermediate thumbnail the blurred variant is built from.
 * This number is the privacy control: at 24px a face is a few dozen pixels of
 * colour, and no amount of processing puts a person back.
 */
const BLUR_SOURCE_EDGE = 24;

/** What the blurred variant is scaled back up to, so it fills the same card. */
const BLUR_OUTPUT_EDGE = 600;

/**
 * The card variant, which is what every surface in the app actually renders.
 *
 * Nothing displays a photo larger than 72px today, so serving the 1600px
 * original to a browse grid meant tens of megabytes for a column of thumbnails.
 * 320 covers 72px at 4x device pixel ratio with room to spare.
 *
 * It exists because these photos cannot go through a shared image optimiser:
 * the bytes at a given URL differ per viewer — blurred for a stranger, clear
 * for a connection — and an optimiser that caches by URL would let the first
 * connected viewer populate a cache entry that a stranger then reads. That is a
 * worse leak than the one optimisation was saving us bandwidth on.
 */
const CARD_EDGE = 320;

import { MAX_EDGE_PX } from "./photo-limits";

export { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, MAX_EDGE_PX, isAcceptableUpload } from "./photo-limits";

export interface ProcessedPhoto {
  readonly full: Buffer;
  /** What cards render. See CARD_EDGE. */
  readonly card: Buffer;
  readonly blurred: Buffer;
  readonly width: number;
  readonly height: number;
}

/**
 * Turns an uploaded image into the three objects that get stored.
 *
 * Throws on anything sharp cannot decode, which is also the check that the file
 * really is an image rather than something wearing an image's content type.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  // rotate() applies the EXIF orientation before that EXIF is discarded.
  // Without it, stripping metadata silently turns portrait photos sideways.
  const base = sharp(input, { failOn: "error" }).rotate();

  const full = await base
    .clone()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const card = await base
    .clone()
    .resize({ width: CARD_EDGE, height: CARD_EDGE, fit: "cover" })
    .webp({ quality: 78 })
    .toBuffer();

  const blurred = await base
    .clone()
    // Down to a thumbnail FIRST. This is the step that makes the result
    // irreversible — everything after it is cosmetic.
    .resize({
      width: BLUR_SOURCE_EDGE,
      height: BLUR_SOURCE_EDGE,
      fit: "inside",
    })
    .resize({
      width: BLUR_OUTPUT_EDGE,
      height: BLUR_OUTPUT_EDGE,
      fit: "inside",
      kernel: "cubic",
    })
    .blur(18)
    .webp({ quality: 60 })
    .toBuffer();

  return {
    full: full.data,
    card,
    blurred,
    width: full.info.width,
    height: full.info.height,
  };
}
