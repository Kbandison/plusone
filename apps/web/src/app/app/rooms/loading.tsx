/** Rooms, while it loads. The tab strip is the thing that anchors this screen. */
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <div className="-mx-6 border-b border-line px-6">
        <div className="flex gap-1 py-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      </div>

      <div className="mt-8 h-7 w-44 animate-pulse rounded-md bg-surface-2" />
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
