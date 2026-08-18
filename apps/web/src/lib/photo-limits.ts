/**
 * Upload limits, shared by the client form and the server action.
 *
 * Deliberately separate from `photos.ts`, which imports sharp. A client
 * component that reached for a constant in there would drag a native image
 * library into the browser bundle — which is exactly how this file came to
 * exist. Nothing here may import anything server-only.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * How many photos a profile may hold.
 *
 * This is not a preference — it is `profile_photos_position_range`, which
 * CHECKs `position between 0 and 5`, so a seventh row cannot exist. It is
 * repeated here because the browser now picks several files at once and has to
 * know how many will fit BEFORE sending any: without it the extras upload,
 * fail on the constraint, and come back as "that did not upload, try again" —
 * advice that would fail forever.
 *
 * `unique (user_id, position)` is the other half, and it is why the uploads run
 * one at a time. Position is chosen by counting existing rows, so two uploads
 * in flight together read the same count and collide.
 */
export const MAX_PHOTOS = 6;

/**
 * Longest edge of the stored photo, and of the browser-side downscale.
 *
 * It lives here rather than in photos.ts because both sides need it and
 * photos.ts imports sharp — a client component cannot go anywhere near it. Two
 * copies of this number would mean the browser shrinking to one size and the
 * server to another, and only the second one being true.
 */
export const MAX_EDGE_PX = 1600;

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

/**
 * The slot a new photo takes: the lowest one nobody is using.
 *
 * `position: count` was correct exactly as long as nothing could be deleted.
 * Positions are a SET WITH HOLES, not a length — delete the first of three and
 * the rows left are 1 and 2, so a count of 2 picks position 2, which exists,
 * and `unique (user_id, position)` refuses the insert. The member is told "that
 * did not upload" and told it every time, while three slots stand empty.
 *
 * Lowest-free also reuses the hole rather than pushing the next photo past the
 * ceiling: with rows at 0 and 5, `max + 1` is 6 and
 * `profile_photos_position_range` refuses that too.
 */
export function lowestFreeSlot(taken: Iterable<number>, max = MAX_PHOTOS): number | null {
  const used = new Set(taken);
  for (let slot = 0; slot < max; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}
