/**
 * The room, and anything opened over it.
 *
 * `modal` is a parallel-route slot. It renders the intercepted thread when a
 * member reaches a post by pressing its comment count from the feed, and
 * `@modal/default.tsx` — which is null — the rest of the time.
 */
export default function RoomLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
