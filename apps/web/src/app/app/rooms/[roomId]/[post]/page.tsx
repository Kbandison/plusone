import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";

import { Thread } from "../thread";

export const metadata: Metadata = { title: DRAFT_COPY.app.postThreadHeading };

const C = DRAFT_COPY.app;

/**
 * A post on its own page.
 *
 * What a shared link, a refresh, or an arrival from outside the room lands on.
 * Pressing the comment count from the feed gets the same Thread inside a modal
 * instead — see @modal/(.)[post] — so the two are one component and cannot
 * drift into two screens.
 */
export default async function PostPage({
  params,
}: {
  params: Promise<{ roomId: string; post: string }>;
}) {
  const { roomId, post } = await params;

  return (
    <main id="main">
      <Link
        href={`/app/rooms/${roomId}`}
        className="ease-brand inline-flex min-h-tap items-center text-[11.7px] text-ink-3 transition-colors duration-300 hover:text-ink"
      >
        ← {C.postBackToRoom}
      </Link>

      <h1 className="sr-only">{C.postThreadHeading}</h1>

      <Thread roomId={roomId} postId={post} />
    </main>
  );
}
