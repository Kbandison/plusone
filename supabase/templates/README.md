# Supabase email templates

These are pasted into the Supabase dashboard by hand — there is no `config.toml`
in this project, so nothing here is applied by a script or checked by CI. They
live in the repo so the markup is reviewable and so the next person does not
rebuild it from a screenshot.

| file              | dashboard location                   |
| ----------------- | ------------------------------------ |
| `magic-link.html` | Authentication → Emails → Magic Link |

## magic-link.html

The email a member gets when they sign in with an address rather than a phone
number. `sign-in/actions.ts` calls `signInWithOtp({ email })` and the code
screen expects a six-digit numeric code — `maxLength={6}`, `pattern="[0-9]*"` —
which is exactly what `{{ .Token }}` produces.

**`{{ .Token }}` is the load-bearing part.** Supabase's default template carries
only `{{ .ConfirmationURL }}`, and with no token in the body the member gets a
link and the code screen has nothing to type. The link is kept as a fallback,
but it is the second path, not the first.

**Suggested subject:** `Your ⁺One sign-in code` — and nothing more. §8 keeps
condition words out of every payload because a preview is visible to whoever is
holding the phone, and an auth email lands on a lock screen like any other
notification. The body says nothing about what this app is for; the wordmark is
the whole brand here.

Colours are `PALETTE.linen` from `packages/ui-tokens`, verbatim. Instrument
Serif carries the wordmark on the web and cannot be loaded in email, so Georgia
stands in — high stroke contrast is the point of it and Georgia is everywhere.

Locked to light. This palette IS the light one, and email clients' dark-mode
inversion mangles a warm cream ground into something muddy. A Dusk variant is
possible if it is ever wanted, but it needs `prefers-color-scheme` blocks that
several clients ignore.

**Verified rendering in mobile WebKit** — the iOS Simulator, which is the engine
Apple Mail uses — rather than only in a desktop browser. Two things that came out
of looking rather than reasoning:

- Padding belongs on the `<td>`, never on a `width="100%"` table. A table at
  100% plus horizontal padding computes wider than the viewport and overflows.
- Chrome headless does not honour `width=device-width` without device emulation,
  so it lays the email out wide and crops it. It reported an overflow that mobile
  WebKit does not have. Check email layout in a real mobile engine.
