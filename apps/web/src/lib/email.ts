import "server-only";

import { notify } from "@plusone/logic";

import { serviceClient } from "./cron";

/** What `emails_for` returns. Confirmed addresses only — see the migration. */
interface Recipient {
  readonly user_id: string;
  readonly email: string;
}

/** Resend's batch endpoint takes at most this many in one call. */
const BATCH = 100;

/**
 * The transport for everybody who never granted push.
 *
 * Push is opt-in and a great many people will never grant it, and on iOS it is
 * not even offered until the app is on a home screen. Until now those members
 * got nothing at all: `notify()` computed the surviving channels, kept the push
 * cohort, and returned early when it was empty. Their switches said email and
 * nothing read them.
 *
 * ── plain text, and no HTML ──────────────────────────────────────────────────
 *
 * Every other transactional mail on the internet is HTML with a remote image in
 * it, because a remote image is how you learn the mail was opened. That is
 * precisely the reason not to: a request for a pixel tells a server that this
 * address read a message from ⁺One, at a time, from an IP — and mail clients
 * that proxy images do not remove the signal, they only move who sees it. There
 * is nothing here worth laying out, so text costs nothing and carries none of
 * that.
 *
 * ── content-blindness reaches this file too ──────────────────────────────────
 *
 * The payload arrived checked, and it is checked again before it goes. The stub
 * notifier gives the reason and it applies with more force here: a provider is
 * the last thing to touch a payload, and an email persists in an inbox in a way
 * a lock-screen line does not. Subject and body are the ones buildPayload made;
 * nothing is added, interpolated, or personalised.
 */
export function emailNotifier(): notify.Notifier {
  return {
    name: "resend",

    async send(deliveries) {
      const wanted = deliveries.filter((d) => d.channel === "email");
      if (wanted.length === 0) return { sent: 0, failed: 0 };

      const from = process.env["RESEND_FROM"];
      const key = process.env["RESEND_API_KEY"];
      // notifier() will not build this without both, so reaching here means the
      // environment changed underneath a running process. Refuse rather than
      // post to Resend without a sender and collect a 422 per message.
      if (!from || !key) return { sent: 0, failed: wanted.length };

      const supabase = serviceClient();
      const recipientIds = [...new Set(wanted.map((d) => d.recipientId))];

      const { data, error } = await supabase.rpc("emails_for", { p_user_ids: recipientIds });
      if (error) {
        console.error(JSON.stringify({ at: "email.addresses", problem: error.message }));
        return { sent: 0, failed: wanted.length };
      }

      const addressOf = new Map<string, string>();
      for (const row of (data ?? []) as Recipient[]) addressOf.set(row.user_id, row.email);

      const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "";

      const messages: { to: string; subject: string; text: string }[] = [];
      let unreachable = 0;

      for (const delivery of wanted) {
        const to = addressOf.get(delivery.recipientId);
        if (!to) {
          // Switched email on and has no confirmed address to send to. Counted
          // as failed because it is honest — nobody was reached — and tallied
          // rather than logged per member, which would be a list of who wants
          // email from this app.
          unreachable += 1;
          continue;
        }

        notify.assertContentBlind(delivery.payload);
        messages.push({
          to,
          subject: delivery.payload.emailSubject,
          text: `${delivery.payload.body}\n\n${appUrl}${delivery.payload.path}\n`,
        });
      }

      if (unreachable > 0) {
        console.info(JSON.stringify({ at: "email.unreachable", count: unreachable }));
      }
      if (messages.length === 0) return { sent: 0, failed: unreachable };

      let sent = 0;
      let failed = unreachable;

      // Batched because a Drop reaches everybody at once, and one request per
      // member would be thousands of round trips against a rate limit.
      for (let i = 0; i < messages.length; i += BATCH) {
        const chunk = messages.slice(i, i + BATCH);
        try {
          const response = await fetch("https://api.resend.com/emails/batch", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(chunk.map((m) => ({ from, ...m }))),
          });

          if (!response.ok) {
            failed += chunk.length;
            // The status and nothing else. Resend echoes the message back in an
            // error body, and the subject is the one thing in it that must not
            // reach a log (§9.6).
            console.error(JSON.stringify({ at: "email.send", status: response.status }));
            continue;
          }
          sent += chunk.length;
        } catch (cause) {
          failed += chunk.length;
          console.error(
            JSON.stringify({
              at: "email.send",
              problem: cause instanceof Error ? cause.message : "unknown",
            }),
          );
        }
      }

      return { sent, failed };
    },
  };
}
