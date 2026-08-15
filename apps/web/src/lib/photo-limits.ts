/**
 * Upload limits, shared by the client form and the server action.
 *
 * Deliberately separate from `photos.ts`, which imports sharp. A client
 * component that reached for a constant in there would drag a native image
 * library into the browser bundle — which is exactly how this file came to
 * exist. Nothing here may import anything server-only.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** Whether a file looks acceptable before any bytes are decoded. */
export function isAcceptableUpload(type: string, size: number): boolean {
  return (
    (ACCEPTED_TYPES as readonly string[]).includes(type) && size > 0 && size <= MAX_UPLOAD_BYTES
  );
}
