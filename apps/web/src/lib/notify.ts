import "server-only";

import { NOTIFICATION_DEFAULTS, type NotificationEvent } from "@plusone/config";
import { notify as notifyLogic } from "@plusone/logic";

import { serviceClient } from "./cron";
import { notifier } from "./notifier";

/**
 * One call, three channels, and the member's own switches.
 *
 * Everything that happens to somebody in this app goes through here. It records
 * the in-app copy, works out which of push and email survive their settings,
 * and sends what is left — so a call site says WHAT HAPPENED and nothing about
 * how anybody hears it.
 *
 * The service client, because the recipient is not the caller. Somebody sending
 * a message writes a notification for the other person, and a member has no
 * insert privilege on notifications at all — deliberately, since one who did
 * could put a notification in anybody's list.
 *
 * Never throws. A notification is a courtesy attached to something that already
 * succeeded: the message is sent, the connect is made, the like is recorded. A
 * failure here must not turn a completed action into an error the member sees.
 */
export async function notify(
  event: NotificationEvent,
  recipients: readonly string[],
  refs: { actorId?: string | undefined; subjectId?: string | undefined } = {},
): Promise<void> {
  const people = [...new Set(recipients.filter(Boolean))];
  if (people.length === 0) return;

  try {
    const supabase = serviceClient();
    const defaults = NOTIFICATION_DEFAULTS[event];

    /**
     * Per recipient, because the switches are per member.
     *
     * Two people can be told about the same event and want different things —
     * one has push on and one has muted it — so the channel list cannot be
     * computed once for the group.
     */
    const wanted = await Promise.all(
      people.map(async (userId) => {
        const { data, error } = await supabase.rpc("notify_member", {
          p_user_id: userId,
          p_event: event,
          p_default_channels: defaults,
          p_actor_id: refs.actorId ?? null,
          p_subject_id: refs.subjectId ?? null,
        });
        if (error) {
          console.error(JSON.stringify({ at: "notify.record", event, problem: error.message }));
          return { userId, channels: [] as string[] };
        }
        return {
          userId,
          channels: ((data ?? []) as { channel: string }[]).map((row) => row.channel),
        };
      }),
    );

    const push = wanted.filter((w) => w.channels.includes("push")).map((w) => w.userId);
    if (push.length === 0) return;

    // planDeliveries builds the payload through buildPayload, which is still the
    // only way to make one and still refuses a condition word. In-app is richer
    // because it is RENDERED from references, not because this got looser.
    const send = notifier();
    await send.send(notifyLogic.planDeliveries(event, push, ["push"]));
  } catch (cause) {
    console.error(
      JSON.stringify({
        at: "notify",
        event,
        problem: cause instanceof Error ? cause.message : "unknown",
      }),
    );
  }
}

/**
 * Who else is in a chat.
 *
 * The service client because the sender is looking up the recipient, and the
 * connect behind a chat is readable to both — but this runs from an action that
 * has already established the caller is a participant.
 */
export async function otherInChat(chatId: string, me: string): Promise<string | null> {
  const supabase = serviceClient();
  const { data } = await supabase
    .from("chats")
    .select("connect_id, connects!inner(initiator_id, target_id)")
    .eq("id", chatId)
    .maybeSingle<{ connects: { initiator_id: string; target_id: string } }>();

  if (!data?.connects) return null;
  const { initiator_id, target_id } = data.connects;
  return initiator_id === me ? target_id : initiator_id;
}

/**
 * Who wrote a room post, and whether they wrote it as themselves.
 *
 * room_messages.user_id is revoked from members — it is the whole anonymity
 * mechanism — so this needs the service client. The author is being told about
 * their own post, which they already know is theirs; nothing here reveals an
 * anonymous author to anybody else.
 */
export async function roomPostAuthor(
  messageId: string,
): Promise<{ userId: string; anonymous: boolean } | null> {
  const supabase = serviceClient();
  const { data } = await supabase
    .from("room_messages")
    .select("user_id, anonymous")
    .eq("id", messageId)
    .is("deleted_at", null)
    .maybeSingle<{ user_id: string; anonymous: boolean }>();

  return data ? { userId: data.user_id, anonymous: data.anonymous } : null;
}

/**
 * Who, in this room, is being spoken to.
 *
 * The service client, and it has to be: room_messages.user_id is revoked from
 * members, because an anonymous author must not be traceable. mentioned_members
 * makes exactly that hop behind a function no member may execute, and the ids
 * never leave this process — they become notifications for the people named and
 * are then gone.
 *
 * Names in, ids out, nothing back to the caller's page. A version of this that
 * a client could reach would be a way to ask "is Cedar the same person as
 * Willow", and that question does not get an answer at any price.
 */
export async function mentionedInRoom(
  roomId: string,
  actorId: string,
  names: readonly string[],
): Promise<string[]> {
  if (names.length === 0) return [];

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("mentioned_members", {
    p_room_id: roomId,
    p_actor: actorId,
    p_names: names,
  });

  if (error) {
    console.error(JSON.stringify({ at: "notify.mentions", problem: error.message }));
    return [];
  }
  return ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
}
