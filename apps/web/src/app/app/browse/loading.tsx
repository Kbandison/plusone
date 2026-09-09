/**
 * Browse, while it loads.
 *
 * A loading file is not decoration here: the Next 16 navigation guide names
 * "dynamic routes without loading.tsx" as the first cause of a transition that
 * feels slow, because without one the click BLOCKS until the server answers.
 * With one, the navigation happens immediately and this stands in — and the
 * route becomes partially prefetchable, so the boundary is already on the
 * device before the tab is pressed.
 *
 * Shaped like Browse rather than generic. There was one skeleton at /app for
 * every tab — a title and three cards — so pressing Inbox flashed something
 * shaped like nothing and then swapped, which reads as a reload even though the
 * navigation was soft. A skeleton that matches what arrives is the difference
 * between waiting and re-loading.
 */
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <div className="mt-4 h-8 w-40 animate-pulse rounded-md bg-surface-2" />

      {/* The filter row, which is the tallest thing above the grid. */}
      <div className="mt-6 flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      <div className="mt-4 h-4 w-56 animate-pulse rounded bg-surface-2" />

      {/* Two columns, because the grid is. */}
      <div className="mt-8 grid grid-cols-2 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="aspect-square animate-pulse rounded-xl bg-surface-2" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>

      <p className="sr-only" role="status">
        Loading
      </p>
    </main>
  );
}
