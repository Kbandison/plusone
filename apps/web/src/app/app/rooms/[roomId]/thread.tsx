import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { DRAFT_COPY } from "@plusone/config";

import { photosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { PostRow, type Post } from "./post-row";
import { Replies } from "./replies";
import { ReplyProvider } from "./reply-context";
import { CommentComposer } from "./room-forms";

const C = DRAFT_COPY.app;

/**
 * One post and its comments.
 *
 * Rendered twice: as a page at /app/rooms/<room>/<post>, and inside a modal
 * over the feed when a member gets there by pressing the comment count. The
 * two are the same component because they are the same thing — a shared link
 * and a tap on a row should not arrive at different screens.
 */
export async function Thread({ roomId, postId }: { roomId: string; postId: string }) {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase.rpc("room_thread", { p_message_id: postId }),
    supabase.from("profiles").select("timezone").eq("id", auth.user.id).maybeSingle(),
  ]);

  const thread = (rows ?? []) as (Post & { parent_id: string | null; is_root: boolean })[];
  const root = thread.find((row) => row.is_root);

  // An absent row means "not yours to see" as easily as "does not exist", and
  // those look identical on purpose — room_thread applies the membership and
  // block walls itself.
  if (!root) notFound();

  // Two levels: comments on the post, and replies under each of them. The
  // database refuses a third, so this cannot be given one to render.
  const comments = thread.filter((row) => !row.is_root && row.parent_id === root?.id);
  const repliesTo = (commentId: string) => thread.filter((row) => row.parent_id === commentId);
  const zone = (profile?.timezone as string | null) ?? "UTC";
  // eslint-disable-next-line react-hooks/purity -- Server Component: one render per request, on the server. The rule models a client re-render, which this has none of.
  const now = Date.now();

  // Every name on this page. A reply's mention is plain text in the body, so
  // recognising it is the only way to find it — and the thread already knows
  // every name it contains.
  const names = [
    ...new Set(thread.map((r) => r.author_name).filter((n): n is string => Boolean(n))),
  ];

  const photos = await photosFor([
    ...new Set(thread.map((row) => row.author_id).filter((id): id is string => id !== null)),
  ]);

  // The post itself counts as seen. A comment does not: it was on this screen
  // because the post was, and counting it would make "seen by" a measure of how
  // many people opened the thread.
  after(async () => {
    await supabase.rpc("record_room_views", { p_message_ids: [root.id] });
  });

  return (
    // The Reply buttons sit inside the rows below and the box they fill sits
    // under them, so the two share state through here rather than through a
    // prop nobody could thread.
    <ReplyProvider>
      {/* Replyable here too: a member reading a thread is exactly where they
          decide to answer the post, and the only other way in is the button
          under every comment. */}
      <div className="-mx-6 border-t border-line px-6 pt-5 pb-4">
        <PostRow
          post={root}
          photo={photos.get(root.author_id ?? "")}
          zone={zone}
          now={now}
          replyable
        />
      </div>

      {/* One rule under the post, then the replies. The vertical hairline down
          their left is what makes the column read as answers at a glance — an
          indent alone is a margin, and a margin is invisible until you have
          something to compare it to. */}
      <ul className="-mx-6 border-t border-line">
        {comments.length === 0 ? (
          <li className="px-6 py-6 text-[12.6px] text-ink-2">{C.postCommentNone}</li>
        ) : null}

        {comments.map((comment) => (
          <li
            key={comment.id}
            /* No rules. The indent does the work on its own — a comment sits
               in from the page edge and a reply sits in from the comment, and
               that is enough to say which is which. The hairlines that were
               here drew a box around every row and made a conversation read as
               a table of them. */
            className="ml-16 py-2 pr-6 pl-4"
          >
            {/* No commentHref — a comment is not a page. Replyable instead:
                answering it nests one layer down, and answering one of THOSE
                puts the name in the box, because the database refuses a third
                level and the mention is what stands in for it. */}
            <PostRow
              post={comment}
              photo={photos.get(comment.author_id ?? "")}
              zone={zone}
              now={now}
              variant="comment"
              mentionable={names}
              replyable
              replyToId={comment.id}
            />

            <Replies commentId={comment.id} count={comment.comment_count}>
              {repliesTo(comment.id).map((reply) => (
                <li key={reply.id} className="mt-2 pl-4">
                  <PostRow
                    post={reply}
                    photo={photos.get(reply.author_id ?? "")}
                    zone={zone}
                    now={now}
                    variant="comment"
                    mentionable={names}
                    replyable
                    replyToId={comment.id}
                  />
                </li>
              ))}
            </Replies>
          </li>
        ))}
      </ul>

      <CommentComposer roomId={roomId} parentId={root.id} />
    </ReplyProvider>
  );
}
