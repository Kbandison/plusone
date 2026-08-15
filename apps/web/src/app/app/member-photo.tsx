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
}: {
  photo: MemberPhoto | undefined;
  size?: number;
  rounded?: string;
}) {
  if (!photo) {
    return (
      <div
        aria-hidden
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
        unoptimized={false}
      />
    </span>
  );
}
