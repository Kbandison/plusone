import Image from "next/image";

import { DRAFT_COPY } from "@plusone/config";

import type { MemberPhoto } from "@/lib/photo-urls";

/**
 * A member's photo on a card.
 *
 * `isBlurred` is a fact from the database, not a styling choice: the view
 * already swapped in the blurred OBJECT, so what arrives here is a different
 * image rather than the real one waiting to be un-CSS'd. The label exists
 * because a blurred photo with no explanation reads as a broken image.
 *
 * Never `priority` — these are faces, and eagerly fetching sixty of them on a
 * browse grid is both slow and more requests than the viewer asked to make.
 */
export function MemberPhotoFrame({
  photo,
  size = 64,
  rounded = "rounded-full",
  emptyLabel,
}: {
  photo: MemberPhoto | undefined;
  size?: number;
  rounded?: string;
  /**
   * What the empty slot means, where that is worth saying.
   *
   * On someone else's card the absence is decoration and stays aria-hidden —
   * "no photo" is not information a viewer needs about a stranger. On your own
   * profile it is the difference between "nothing loaded" and "you have not
   * added one", which is the whole point of the screen.
   */
  emptyLabel?: string;
}) {
  if (!photo) {
    return (
      <div
        aria-hidden={emptyLabel ? undefined : true}
        role={emptyLabel ? "img" : undefined}
        aria-label={emptyLabel}
        className={`${rounded} shrink-0 bg-surface-2`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span className="relative inline-block shrink-0">
      <Image
        src={photo.url}
        alt={photo.isBlurred ? DRAFT_COPY.app.photoBlurredNote : DRAFT_COPY.app.photoAlt}
        width={size}
        height={size}
        className={`${rounded} object-cover`}
        style={{ width: size, height: size }}
        // Never optimised, and this is a correctness rule rather than a
        // preference. The bytes behind one of these URLs differ by viewer —
        // blurred for a stranger, clear for a connection — and Vercel's image
        // optimiser caches by URL, so the first connected viewer would populate
        // an entry a stranger then reads. It also kept the signed URL out of
        // our own access logs, where §9.6 wants opaque ids only: the browser
        // now fetches Supabase directly and the credential never crosses our
        // domain. The stored card variant is what makes this affordable.
        unoptimized
      />
    </span>
  );
}
