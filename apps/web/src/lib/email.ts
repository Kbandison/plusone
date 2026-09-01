import "server-only";

import {
  EMAIL_ACTION_LABEL,
  EMAIL_DIRECT_FOOTER,
  EMAIL_NOTIFICATION_FOOTER,
  parseClientEnv,
} from "@plusone/config";
import { notify } from "@plusone/logic";

import { serviceClient } from "./cron";
import { brandEmailHtml } from "./email-brand";

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
 * ── branded HTML, and still no remote resource ───────────────────────────────
 *
 * This said "plain text, and no HTML" until 2026-09-01, and the reason it gave
 * was right about the wrong thing. It was this: every other transactional mail
 * is HTML with a remote image in it, because a remote image is how you learn a
 * mail was opened — a pixel request tells a server that this address read a
 * message from ⁺One, at a time, from an IP, and clients that proxy images move
 * who sees that signal rather than removing it.
 *
 * All of which is an argument against REMOTE RESOURCES, not against markup. It
 * was doing duty as an argument against both, and the second one was never
 * examined: two designed auth emails and a bare line of text is not a decision,
 * it is an omission with a rationale attached.
 *
 * So: branded now (Kevin, 2026-09-01), with the actual reason kept intact.
 * `email-brand.ts` emits no image, no stylesheet, no font and no URL that is
 * not the member's own destination, and `email-brand.test.ts` fails on any of
 * them. Styled while asking for nothing is the whole point.
 *
 * BOTH parts go, always. The text is not a fallback nobody sees — it is what a
 * client with HTML off renders, what a screen reader handles most reliably, and
 * what keeps this out of a spam folder.
 *
 * ── content-blindness reaches this file too ──────────────────────────────────
 *
 * The payload arrived checked, and it is checked again before it goes. The stub
 * notifier gives the reason and it applies with more force here: a provider is
 * the last thing to touch a payload, and an email persists in an inbox in a way
 * a lock-screen line does not. Subject and body are the ones buildPayload made;
 * nothing is added, interpolated, or personalised.
 */
/**
 * One message to one address that belongs to no member.
 *
 * `emailNotifier` cannot do this and should not learn how: it resolves
 * addresses through `emails_for(user_ids)`, which is the right shape for a
 * notification — it only ever reaches a member who confirmed an address and
 * left the switch on. A waitlist confirmation has no user id to resolve, no
 * notification preference to respect, and no member behind it at all.
 *
 * Everything else about it is deliberately identical, because the reasons are:
 * plain text, no HTML, and no remote image. A tracking pixel would tell a
 * server that this address opened a message from an HSV and HIV app, at a time,
 * from an IP — and that is a worse disclosure here than in the member path,
 * because the recipient has not agreed to anything yet.
 *
 * Returns whether it went. Callers must NOT surface that to the browser — see
 * the oracle note in lib/waitlist.ts.
 */
export async function sendDirectEmail(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const from = process.env["RESEND_FROM"];
  const key = process.env["RESEND_API_KEY"];
  if (!from || !key) {
    console.error(JSON.stringify({ at: "email.direct", problem: "not configured" }));
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Text AND html. Its own footer, because this recipient is not a member:
      // there is no switch to point them at and no account behind the address.
      body: JSON.stringify({
        from,
        ...message,
        html: brandEmailHtml({ body: message.text, footer: EMAIL_DIRECT_FOOTER }),
      }),
    });
    if (!response.ok) {
      // Status only. Resend echoes the request back in an error body, and both
      // the subject and the recipient are things that must not reach a log
      // (§9.6) — the recipient most of all, since an address in our logs beside
      // this app's name is the disclosure the whole waitlist design avoids.
      console.error(JSON.stringify({ at: "email.direct", status: response.status }));
      return false;
    }
    return true;
  } catch (cause) {
    console.error(
      JSON.stringify({
        at: "email.direct",
        problem: cause instanceof Error ? cause.message : "unknown",
      }),
    );
    return false;
  }
}

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

      /**
       * Parsed rather than read, so a missing origin is loud.
       *
       * This was `?? ""`, which turns an unset variable into a RELATIVE link at
       * the foot of an email — `/app`, which means nothing in an inbox and
       * nothing a member can click. The schema types it as an origin and every
       * other server caller goes through parseClientEnv; this was the one that
       * did not, and it degraded silently in the direction nobody would see
       * until a member complained about a dead link.
       *
       * 6c60f63 is why this is not hypothetical. NEXT_PUBLIC_APP_URL pointed at
       * a host that answers 404 for long enough that email would have shipped a
       * broken link in every notification — a wrong origin and a missing one
       * fail the same way, and only one of them was going to be noticed.
       */
      const { NEXT_PUBLIC_APP_URL: appUrl } = parseClientEnv(process.env);

      const messages: { to: string; subject: string; text: string; html: string }[] = [];
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
        const url = `${appUrl}${delivery.payload.path}`;
        messages.push({
          to,
          subject: delivery.payload.emailSubject,
          // BOTH parts, always. The text is not a fallback nobody sees — it is
          // what a client with images or HTML off renders, what a screen reader
          // reads most reliably, and what keeps this out of a spam folder.
          // Dropping it to send only HTML would be a regression dressed as a
          // redesign.
          text: `${delivery.payload.body}\n\n${url}\n`,
          html: brandEmailHtml({
            body: delivery.payload.body,
            url,
            action: EMAIL_ACTION_LABEL,
            footer: EMAIL_NOTIFICATION_FOOTER,
          }),
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
