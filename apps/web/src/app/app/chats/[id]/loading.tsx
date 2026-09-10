import { SkeletonAvatar, SkeletonStatus } from "@/app/app/skeletons";

/**
 * A chat, while its messages are fetched.
 *
 * The header is sticky and full-bleed on the real screen, so it is shaped that
 * way here — it is the one part a member looks at to know they opened the right
 * conversation, and having it settle into place afterwards is the jump this
 * exists to avoid.
 *
 * The bubbles alternate sides because a chat that loads as one aligned column
 * and then re-sorts itself reads as content changing rather than arriving.
 */
export default function Loading() {
  return (
    <main id="main" className="flex min-h-full flex-col" aria-busy="true">
      <div className="-mx-6 flex items-center gap-3 border-b border-line px-6 pt-1 pb-3">
        <SkeletonAvatar size={40} />
        <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {[
          "w-2/3 self-start",
          "w-1/2 self-end",
          "w-3/4 self-start",
          "w-2/5 self-end",
          "w-3/5 self-start",
        ].map((shape, i) => (
          <div key={i} className={`h-12 animate-pulse rounded-2xl bg-surface-2 ${shape}`} />
        ))}
      </div>
      <SkeletonStatus />
    </main>
  );
}
