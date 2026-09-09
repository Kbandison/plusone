import { redirect } from "next/navigation";

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
