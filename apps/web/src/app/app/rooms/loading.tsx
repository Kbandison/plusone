/**
 * Rooms, while it loads.
 *
 * NO TAB STRIP, though this file drew one until 2026-09-09. `loading.tsx` nests
 * INSIDE `layout.tsx` — the docs are explicit that it wraps `page.js` and the
 * children below it, and not the layout in the same segment — so `RoomTabs` has
 * already rendered above this and a second strip is a duplicate, not a
 * placeholder. It read as the screen rebuilding itself.
 */
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <div className="mt-2 h-7 w-44 animate-pulse rounded-md bg-surface-2" />
      <div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-surface-2" />
      <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-surface-2" />

      <ul className="-mx-6 mt-6 border-t border-line">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex gap-3 border-b border-line px-6 py-3">
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-surface-2" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-3 w-1/4 animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-full animate-pulse rounded bg-surface-2" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-2" />
            </div>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status">
        Loading
      </p>
    </main>
  );
}
