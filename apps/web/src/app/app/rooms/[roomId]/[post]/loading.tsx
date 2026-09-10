import { ThreadSkeleton } from "../thread-skeleton";

/**
 * A thread reached directly — a shared link, a refresh, or an arrival from
 * outside the room. The intercepting modal is not involved, so this is the
 * thread on its own page.
 */
export default function Loading() {
  return (
    <main id="main">
      <ThreadSkeleton />
    </main>
  );
}
