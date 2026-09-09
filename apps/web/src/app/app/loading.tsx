import { Card } from "@/app/ui";

/*
 * Tonight's skeleton, and no longer everybody's.
 *
 * This was the only loading file under /app, so it stood in for all five tabs —
 * a title and three cards, whatever you had pressed. Browse, Inbox, Rooms and
 * Profile have their own now, each shaped like what actually arrives, because a
 * skeleton that matches nothing on the screen you asked for reads as a reload
 * even when the navigation was soft.
 *
 * It still covers the segments without one of their own, which is the right
 * default: a card list is what most of them are.
 */

/**
 * What the app shows while a screen is being built.
 *
 * Every route here is force-dynamic and does its work in sequential server
 * round-trips — the layout resolves the member's step, then the page runs its
 * own queries — so there was a real, visible pause with nothing on screen at
 * all. Next renders this in its place.
 *
 * Deliberately not a spinner: a shape roughly the size of what is coming means
 * the page does not jump when it arrives.
 */
export default function Loading() {
  return (
    <main id="main" aria-busy="true">
      <div className="h-9 w-1/2 animate-pulse rounded-md bg-surface-2" />
      <div className="mt-10 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-4 w-1/3 rounded bg-surface-2" />
            <div className="mt-3 h-3 w-2/3 rounded bg-surface-2" />
          </Card>
        ))}
      </div>
      {/* Announced once, rather than a live region that chatters on every
          navigation. */}
      <p className="sr-only" role="status">
        Loading
      </p>
    </main>
  );
}
