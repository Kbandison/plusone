import { SkeletonAvatar, SkeletonLine, SkeletonStatus } from "@/app/app/skeletons";

/**
 * Somebody's profile, while it is fetched.
 *
 * The identity header first — photo and name — because that is what a member
 * checks to know they opened the right person. Then the gallery, then prompts,
 * then the message box, which is the order the real panel renders in.
 *
 * The gallery row is deliberately shown: backlog 27d put the rest of somebody's
 * photos under the header, so a skeleton without it settles by pushing
 * everything below it down at the moment the member starts reading.
 */
export function ConnectSkeleton() {
  return (
    <div aria-busy="true">
      <div className="flex items-center gap-4">
        <SkeletonAvatar size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SkeletonLine w="w-1/2" h="h-5" />
          <SkeletonLine w="w-1/3" />
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 flex-1 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line-2 p-4">
            <SkeletonLine w="w-1/3" />
            <SkeletonLine w="w-full" />
            <SkeletonLine w="w-3/4" />
          </div>
        ))}
      </div>

      <div className="mt-6 h-24 w-full animate-pulse rounded-xl bg-surface-2" />
      <SkeletonStatus />
    </div>
  );
}
