import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DRAFT_COPY } from "@plusone/config";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { PostRow, type Post } from "../post-row";
import { CommentComposer } from "../room-forms";
import { ReplyProvider } from "../reply-context";

export const metadata: Metadata = { title: DRAFT_COPY.app.postThreadHeading };

const C = DRAFT_COPY.app;

/**
 * One post and its comments.
 *
 * A separate screen rather than an expander in the feed, because a comment is a
 * post — it can be reported, blocked, liked and written anonymously — and
 * hanging all of that off a row inside a scrolling list makes the list the
 * thing that has to hold state.
 *
 * room_thread returns the post and its comments in the SAME projection the feed
 * uses, so anonymity is decided once in SQL and nothing here re-derives it.
 */
export default async function PostPage({
  params,
}: {
  params: Promise<{ roomId: string; post: string }>;
}) {
  /* The segment is [post], not [postId].
     urls-are-content-blind.test.ts matches banned terms as substrings, and
     "postId" lowercases to "postid" — which contains "sti". A false positive,
     and the fix is to rename the segment rather than to loosen a check that
     exists to keep condition words out of URLs. */
  const { roomId, post: postId } = await params;
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const [{ data: thread }, { data: profile }] = await Promise.all([
    supabase.rpc("room_thread", { p_message_id: postId }),
    supabase.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle(),
  ]);

  const rows = (thread ?? []) as (Post & { is_root: boolean })[];
  const root = rows.find((row) => row.is_root);

  // An absent row means "not yours to see" as easily as "does not exist", and
  // those look identical on purpose — room_thread applies the membership and
  // block walls itself.
  if (!root) notFound();

  const comments = rows.filter((row) => !row.is_root);
  const zone = (profile?.timezone as string | null) ?? "UTC";
  const now = Date.now();

  // Every name on this page. A reply's mention is plain text in the body, so
  // recognising it is the only way to find it — and the thread already knows
  // every name it contains.
  const names = [...new Set(rows.map((r) => r.author_name).filter((n): n is string => Boolean(n)))];

  const photos = await photosFor([
    ...new Set(rows.map((row) => row.author_id).filter((id): id is string => id !== null)),
  ]);

  // The post itself counts as seen. A comment does not: it was on this screen
  // because the post was, and counting it would make "seen by" a measure of how
  // many people opened the thread.
  after(async () => {
    await supabase.rpc("record_room_views", { p_message_ids: [root.id] });
  });

  return (
    <main id="main">
      <Link
        href={`/app/rooms/${roomId}`}
        className="ease-brand inline-flex min-h-tap items-center text-[11.7px] text-ink-3 transition-colors duration-200 hover:text-ink"
      >
        ← {C.postBackToRoom}
      </Link>

      <h1 className="sr-only">{C.postThreadHeading}</h1>

      {/* The Reply buttons sit inside the rows below and the box they fill sits
          above them, so the two share state through here rather than through a
          prop nobody could thread. */}
      <ReplyProvider>
        {/* border-t only. With border-y here and border-t on the list below,
            the gap between them drew as two rules with a stripe of ground
            between. */}
        <div className="-mx-6 mt-2 border-t border-line px-6 pt-5 pb-4">
          {/* Replyable here too: a member reading a thread is exactly where
              they decide to answer the post, and the only other way in was the
              button below every comment. */}
          <PostRow
            post={root}
            photo={photos.get(root.author_id ?? "")}
            zone={zone}
            now={now}
            replyable
          />
        </div>

        {/* One rule under the post, then the replies. The vertical hairline
            down their left is what makes the column read as answers at a
            glance — an indent alone is a margin, and a margin is invisible
            until you have something to compare it to. */}
        <ul className="-mx-6 border-t border-line">
          {comments.length === 0 ? (
            <li className="px-6 py-6 text-[12.6px] text-ink-2">{C.postCommentNone}</li>
          ) : null}

          {/* Set in from the left, so the column of answers reads as answers
              without any of them having to say so. The post above starts at the
              page edge; these do not. */}
          {comments.map((comment) => (
            <li
              key={comment.id}
              /* Narrower and tighter. The indent grew and the vertical padding
                 shrank; nothing inside changed size, so a reply is a smaller
                 slot holding the same things rather than smaller things. */
              className="ml-16 border-b border-line border-l-2 border-l-line-2 py-2 pr-6 pl-4"
            >
              {/* No commentHref — a reply cannot be replied to, and the
                  database refuses one rather than trusting this not to offer
                  it. Replyable instead: answering somebody puts their name in
                  the same box, which is the same conversation without a second
                  level to store. */}
              <PostRow
                post={comment}
                photo={photos.get(comment.author_id ?? "")}
                zone={zone}
                now={now}
                variant="comment"
                mentionable={names}
                replyable
              />
            </li>
          ))}
        </ul>

        {/* At the bottom, which is where a member ends up.
            Above the comments it was the first thing on the way in and the
            last thing they could reach on the way back — and pressing Reply on
            a comment sent focus upward past everything they had just read. */}
        <CommentComposer roomId={roomId} parentId={root.id} />
      </ReplyProvider>
    </main>
  );
}
