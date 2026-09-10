import { ConnectSkeleton } from "../connect-skeleton";

/** A profile reached directly — a shared link, or a refresh on the panel. */
export default function Loading() {
  return (
    <main id="main">
      <ConnectSkeleton />
    </main>
  );
}
