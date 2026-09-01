import "server-only";

import { PALETTE } from "@plusone/ui-tokens";

/**
 * The branded shell for the app's own email.
 *
 * Kevin's call 2026-09-01: the notification and waitlist mails should look like
 * the product rather than like a raw line of text beside two designed auth
 * emails.
 *
 * ── what changed, and what deliberately did NOT ──────────────────────────────
 *
 * This file used to say "plain text, and no HTML". The reason given was that a
 * remote image is how open-tracking works: a pixel request tells a server that
 * this address opened a message from ⁺One, at a time, from an IP, and mail
 * clients that proxy images move who sees that signal rather than removing it.
 *
 * That reason is about REMOTE RESOURCES, not about markup, and it survives
 * intact: there is no image here, no stylesheet, no font, and no URL that is
 * not the member's own destination. `email-brand.test.ts` fails on any of them.
 * Styled and still asking for nothing is the whole point.
 *
 * Content-blindness also survives, and it is the part worth being careful
 * about. The body is whatever `buildPayload` made, escaped and never parsed;
 * nothing is interpolated into it, nothing is personalised, and the only text
 * this file adds is the wordmark and a footer that says why the mail arrived.
 *
 * ── why this is code and the Supabase templates are files ────────────────────
 *
 * Those two are pasted into a dashboard by hand and can only be kept in step by
 * a test. This one imports PALETTE directly, so it cannot drift from the brand
 * at all — which is the better arrangement and is available here only because
 * we control the send.
 */
const L = PALETTE.linen;
const D = PALETTE.dusk;

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Escaped, never parsed. The body is a member-facing string, not markup. */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BrandedEmail {
  /** The message, exactly as buildPayload wrote it. */
  readonly body: string;
  /** Where it goes, if anywhere. Rendered as the one link in the mail. */
  readonly url?: string | undefined;
  readonly action?: string | undefined;
  /**
   * The line under the rule, which is NOT the same sentence for both senders.
   *
   * A notification can be turned off in Settings and saying so is the honest
   * footer for one. The waitlist confirmation has no member behind it, no
   * preference to respect and no Settings to reach — telling that recipient to
   * change a setting they do not have would be the app inventing a relationship
   * that does not exist yet.
   */
  readonly footer: string;
}

export function brandEmailHtml({ body, url, action, footer }: BrandedEmail): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p class="p1-ink" style="margin:0 0 14px 0; font-family:${SANS}; font-size:15px; line-height:1.65; color:${L.ink};">${escape(p).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  const button = url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
        <tr>
          <td class="p1-btn" align="center" style="background-color:${L.accent}; border-radius:999px;">
            <a href="${escape(url)}" class="p1-btn-ink" style="display:inline-block; padding:13px 26px; font-family:${SANS}; font-size:14px; line-height:1; color:${L.accentInk}; text-decoration:none;">${escape(action ?? "Open ⁺One")}</a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
      @media (prefers-color-scheme: dark) {
        .p1-ground { background-color: ${D.ground} !important; }
        .p1-card { background-color: ${D.surface} !important; border-color: ${D.line} !important; }
        .p1-mark { color: ${D.ink} !important; }
        .p1-accent { color: ${D.accent} !important; }
        .p1-ink { color: ${D.ink} !important; }
        .p1-ink3 { color: ${D.ink3} !important; }
        .p1-btn { background-color: ${D.accent} !important; }
        .p1-btn-ink { color: ${D.accentInk} !important; }
        .p1-rule { border-top-color: ${D.line2} !important; }
      }
    </style>
  </head>
  <body class="p1-ground" style="margin:0; padding:0; background-color:${L.ground};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="p1-ground" style="background-color:${L.ground};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="p1-card" style="max-width:480px; background-color:${L.surface}; border:1px solid ${L.line}; border-radius:16px;">
            <tr>
              <td style="padding:36px 36px 28px 36px;">
                <p class="p1-mark" style="margin:0 0 28px 0; font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:1; color:${L.ink};"><span class="p1-accent" style="color:${L.accent};">&#8314;</span>One</p>
                ${paragraphs}
                ${button}
                <hr class="p1-rule" style="border:none; border-top:1px solid ${L.line2}; margin:28px 0 0 0;" />
                <p class="p1-ink3" style="margin:20px 0 0 0; font-family:${SANS}; font-size:12px; line-height:1.7; color:${L.ink3};">${escape(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
