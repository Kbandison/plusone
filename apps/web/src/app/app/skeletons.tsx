/**
 * The pieces every loading file is built from.
 *
 * Six skeletons were about to invent six slightly different greys and six
 * slightly different row heights. The shapes below are the ones that already
 * exist on screen — a member row, a message bubble, a line of text — so a
 * skeleton is assembled from them rather than drawn again.
 *
 * `bg-surface-2` and `animate-pulse` are the only visual decisions here, and
 * they match `app/loading.tsx`, which set them first.
 */

/** A line of text. Widths vary so a paragraph does not read as a barcode. */
export function SkeletonLine({ w = "w-full", h = "h-3" }: { w?: string; h?: string }) {
  return <div className={`${h} ${w} animate-pulse rounded bg-surface-2`} />;
}

/** Where a face or a publisher's mark goes. */
export function SkeletonAvatar({ size = 46 }: { size?: number }) {
  return (
    <div
      className="shrink-0 animate-pulse rounded-full bg-surface-2"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * One row of the feed: a mark, a source line, and two lines of headline.
 *
 * `min-w-0` on the text column for the same reason the real row has it — a flex
 * child defaults to min-width:auto and will not shrink below its content.
 */
export function SkeletonPostRow({ size = 46 }: { size?: number }) {
  return (
    <div className="flex gap-3 py-3">
      <SkeletonAvatar size={size} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SkeletonLine w="w-1/4" />
        <SkeletonLine w="w-full" h="h-3.5" />
        <SkeletonLine w="w-2/3" h="h-3.5" />
      </div>
    </div>
  );
}

/** Announced once, rather than a live region that chatters on every navigation. */
export function SkeletonStatus() {
  return (
    <p className="sr-only" role="status">
      Loading
    </p>
  );
}
