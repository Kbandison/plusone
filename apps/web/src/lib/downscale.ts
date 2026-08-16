import { MAX_EDGE_PX, MAX_UPLOAD_BYTES } from "./photo-limits";

/**
 * Shrinking a photo in the browser, before it is uploaded.
 *
 * The server resizes every photo to 1600px anyway, so sending the original was
 * carrying 10–20MB across someone's mobile data to have it thrown away at the
 * other end. It also meant a phone camera photo could not be uploaded at all:
 * it passed our own 8MB check and then hit the framework's request body cap.
 *
 * This is an optimisation, NOT a trust boundary. The server still validates the
 * type and size, still strips EXIF, and still produces the stored variants —
 * nothing here is believed. A browser that cannot do this sends the original
 * and the server behaves exactly as before.
 *
 * Two details that matter:
 *
 *   · `imageOrientation: "from-image"` applies the EXIF rotation while
 *     decoding. Without it, re-encoding through a canvas drops the orientation
 *     tag and silently turns every portrait photo sideways — the same trap
 *     sharp's rotate() exists for on the server.
 *   · Canvas re-encoding discards all metadata, GPS included. That is a happy
 *     side effect and not the reason this exists; the server strips it too, and
 *     that is the one that counts.
 */

/** Longest edge after downscaling. Matches MAX_EDGE in lib/photos.ts. */
export const CLIENT_MAX_EDGE = MAX_EDGE_PX;

/** Quality for the re-encode. High enough that the server's own pass is a no-op. */
const QUALITY = 0.9;

export interface DownscaleResult {
  readonly file: File;
  /** False when the browser could not decode it and the original is being sent. */
  readonly downscaled: boolean;
}

export async function downscalePhoto(file: File): Promise<DownscaleResult> {
  // Nothing to gain: already small and already within every limit.
  if (file.size <= 512 * 1024) return { file, downscaled: false };

  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return { file, downscaled: false };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC in a browser that cannot decode it, or a corrupt file. Let the
    // server say so — it has the real answer and the real error message.
    return { file, downscaled: false };
  }

  try {
    const scale = Math.min(1, CLIENT_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { file, downscaled: false };
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob || blob.size === 0) return { file, downscaled: false };

    // If the re-encode somehow came out larger, keep the original.
    if (blob.size >= file.size) return { file, downscaled: false };

    return {
      file: new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" }),
      downscaled: true,
    };
  } finally {
    bitmap.close();
  }
}

/** Whether this is going to be refused whatever we do. */
export function isTooLargeToSend(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}
