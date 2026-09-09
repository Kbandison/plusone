/** Your own profile, while it loads. Name and face first, then the sections. */
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <div className="flex items-center gap-4">
        <div className="size-[72px] shrink-0 animate-pulse rounded-full bg-surface-2" />
        <div className="h-7 w-40 animate-pulse rounded-md bg-surface-2" />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="mt-14 border-t-2 border-line-2 pt-10">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 h-10 w-full animate-pulse rounded-lg bg-surface-2" />
        </div>
      ))}
      <p className="sr-only" role="status">
        Loading
      </p>
    </main>
  );
}
