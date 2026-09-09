/** Inbox, while it loads. A list of people, so the skeleton is rows with faces. */
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <div className="mt-4 h-8 w-32 animate-pulse rounded-md bg-surface-2" />
      <ul className="-mx-6 mt-8 border-t border-line">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-4 border-b border-line px-6 py-4">
            <div className="size-12 shrink-0 animate-pulse rounded-full bg-surface-2" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
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
