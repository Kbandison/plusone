import { SkeletonLine, SkeletonPostRow, SkeletonStatus } from "@/app/app/skeletons";

/**
 * A room, while its feed is fetched.
 *
 * NO TAB STRIP. `loading.tsx` nests inside `layout.tsx`, so `RoomTabs` is
 * already on screen above this — drawing a second one is what `rooms/loading`
 * was doing, and it read as the page rebuilding itself rather than filling in.
 *
 * The title, the description and the search box are all real chrome that
 * arrives with the page, so they are shaped here at the size they land at.
 */
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <div className="mt-2 h-7 w-44 animate-pulse rounded-md bg-surface-2" />
      <div className="mt-3 flex flex-col gap-2">
        <SkeletonLine w="w-3/4" />
        <SkeletonLine w="w-1/2" />
      </div>
      <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-surface-2" />

      <ul className="-mx-6 mt-6 border-t border-line px-6">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="border-b border-line">
            <SkeletonPostRow />
          </li>
        ))}
      </ul>
      <SkeletonStatus />
    </main>
  );
}
