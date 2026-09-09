import { redirect } from "next/navigation";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

/**
 * The chat list moved into the inbox.
 *
 * A connect and the chat it becomes are one thread, and Decision #14 describes
 * one pipeline. This stays as a redirect rather than being deleted: it is where
 * the app itself linked for months, it is where a notification may still point,
 * and a member who bookmarked it should land on the list rather than a 404.
 *
 * /app/chats/[id] is untouched — the conversation is still its own screen.
 */
export default function ChatsIndexRedirect(): never {
  redirect("/app/inbox");
}
