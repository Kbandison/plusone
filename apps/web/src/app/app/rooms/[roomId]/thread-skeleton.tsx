import { SkeletonAvatar, SkeletonLine, SkeletonStatus } from "@/app/app/skeletons";

/**
 * A thread, while `room_thread` and the photos are fetched.
 *
 * One post and its comments, and the comments are visibly smaller — the real
 * row renders a 24px mark for a comment against 46px for the post, so a
 * uniform stack would settle into something a different shape on arrival.
 */
export function ThreadSkeleton() {
  return (
    <div aria-busy="true">
      <div className="flex gap-3">
        <SkeletonAvatar size={46} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SkeletonLine w="w-1/3" />
          <SkeletonLine w="w-full" h="h-4" />
          <SkeletonLine w="w-5/6" h="h-4" />
          <SkeletonLine w="w-2/3" h="h-4" />
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-5 border-t border-line pt-5">
        {[0, 1].map((i) => (
          <li key={i} className="flex gap-3">
            <SkeletonAvatar size={24} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <SkeletonLine w="w-1/4" />
              <SkeletonLine w="w-3/4" />
            </div>
          </li>
        ))}
      </ul>
      <SkeletonStatus />
    </div>
  );
}
