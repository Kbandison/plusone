/**
 * The shared primitives.
 *
 * auth-fields.tsx already made this argument and made it only for itself:
 * "Copying them for /sign-in would have meant two definitions of the same
 * accessible field, and the accessibility fix below is exactly the kind that
 * gets made in one copy and not the other." That is precisely what happened
 * everywhere else — a design review counted thirteen spellings of the primary
 * button across twenty-five files, fifteen of the card, and four of the
 * wordmark. The focus-ring bug fixed this morning was in twenty-three of them.
 *
 * Deliberately server-safe: no "use client" here, so a Server Component can use
 * these without pulling anything into the browser bundle. The two interactive
 * ones live beside their own forms.
 */

import Link from "next/link";

type ButtonTone = "primary" | "secondary" | "quiet" | "danger";

/**
 * Every control clears the 44px floor LAYOUT.minTapTarget declares — it was
 * honoured in exactly one place in the whole app.
 *
 * No `focus:outline-none` anywhere: globals.css defines the keyboard focus ring
 * and cancelling it is what made a keyboard user unable to see where they were.
 */
const TONE: Record<ButtonTone, string> = {
  primary:
    "bg-accent text-accent-ink hover:not-disabled:opacity-90 active:not-disabled:scale-[0.995] disabled:opacity-55",
  secondary:
    "border border-line-control text-ink hover:not-disabled:border-accent disabled:opacity-55",
  quiet:
    "text-ink-2 underline decoration-line-control underline-offset-4 hover:not-disabled:text-ink disabled:opacity-55",
  danger:
    "border border-line-control text-ink hover:not-disabled:border-critical hover:not-disabled:text-critical disabled:opacity-55",
};

/**
 * What a disabled button does BESIDES going translucent.
 *
 * `disabled:opacity-55` was the only marker on every tone, and on a filled
 * accent button 55% still reads as solid and pressable. Found in the Simulator
 * on 18a's "Turn incognito on", where a free member taps a button that looks
 * live, nothing happens, and the reason is sitting in a paragraph BELOW the
 * button rather than on it.
 *
 * Two things are wrong there and only one is a matter of taste.
 *
 * The opacity value is taste, and it is left alone — that is a design call, not
 * a bug fix, and changing it unilaterally restyles every disabled control in
 * the app.
 *
 * The rest is not taste. `:hover` still MATCHES a disabled button in every
 * browser, so `hover:opacity-90` fired on a disabled primary and hovering one
 * changed its appearance — the single strongest signal a control has for
 * saying "I am interactive". Every hover on every tone is `not-disabled:` now,
 * and the cursor says so too. A pointer over a dead control is the other half
 * of the same lie.
 */
const DISABLED = "disabled:cursor-not-allowed";

/**
 * The same treatment, for form CONTROLS rather than buttons.
 *
 * `3e74775` fixed disabled buttons and stopped there, which turned out to be
 * half the problem. macOS measured 18d's locked filter groups in WKWebView and
 * found a disabled select **pixel-identical to a live one** — same opacity,
 * same colour, same border, to the value:
 *
 *     FREE   distance: opacity 1  colour rgb(107,98,89)  border rgba(28,25,23,0.34)
 *     LOCKED kids:     opacity 1  colour rgb(107,98,89)  border rgba(28,25,23,0.34)
 *
 * The reason is that `disabled:opacity-55` lives in this file's TONE map, which
 * only buttons read. Filter fields have their own class string and never had
 * any disabled styling at all, so the question we spent a while circling — is
 * 55% dim enough — never applied to them in the first place.
 *
 * Seventeen controls were genuinely `:disabled` and none of them looked it. A
 * member scanning the fold taps "Kids", nothing happens, and the only thing
 * that ever said why is a tag on the legend above.
 *
 * The VALUE is deliberately the app's existing one rather than a new choice —
 * extending a convention to controls that were missed, not restyling. What
 * treatment a locked field ideally wants is still Kevin's, and it is a specific
 * question with numbers now rather than a taste one.
 */
export const FIELD_DISABLED = `${DISABLED} disabled:opacity-55`;

const SHAPE_BASE = `ease-brand inline-flex min-h-tap items-center justify-center rounded-lg text-body-sm transition-[opacity,transform,border-color,color] duration-300 ${DISABLED}`;

const SHAPE = `${SHAPE_BASE} px-5`;

/**
 * A square button holding one glyph.
 *
 * Not `buttonClass(tone, "size-tap px-0")`, which is what this was and which
 * silently did nothing. Tailwind resolves same-property utilities by their
 * order in the generated stylesheet, not by the order they appear in the class
 * attribute — `.px-5` is emitted after `.px-0`, so the override lost. The
 * microphone ended up in a 44px box with 20px of padding a side: two pixels of
 * content, and an SVG flex item shrinks to fit. It rendered as an empty border.
 *
 * So the padding is never added rather than added and argued with.
 */
export function iconButtonClass(tone: ButtonTone = "secondary", extra = ""): string {
  return `${SHAPE_BASE} size-tap shrink-0 ${TONE[tone]} ${extra}`.trim();
}

export function buttonClass(tone: ButtonTone = "primary", extra = ""): string {
  const shape =
    tone === "quiet"
      ? `ease-brand inline-flex min-h-tap items-center text-body-sm transition-colors duration-300 ${DISABLED}`
      : SHAPE;
  return `${shape} ${TONE[tone]} ${extra}`.trim();
}

export function Button({
  tone = "primary",
  className = "",
  ...props
}: { tone?: ButtonTone } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={buttonClass(tone, className)} {...props} />;
}

export function ButtonLink({
  tone = "primary",
  className = "",
  href,
  children,
  ...props
}: { tone?: ButtonTone; className?: string } & React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={buttonClass(tone, className)} {...props}>
      {children}
    </Link>
  );
}

/**
 * The bordered panel used for sections, list rows and empty states.
 *
 * `sunk` is the quieter variant for a panel inside a panel — it was being
 * spelled with a different background each time it appeared.
 */
export function Card({
  sunk = false,
  className = "",
  children,
  ...props
}: { sunk?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`rounded-xl border border-line-2 p-6 ${sunk ? "bg-surface-2" : "bg-surface"} ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

/**
 * The shell every signed-out page shares.
 *
 * Five pages spelled the same class string by hand — /waitlist, its confirm,
 * leave and manage screens, and the two invite landings — which is the
 * duplication the "one definition per primitive" test at the top of this file
 * exists to stop. It was only ever noticed because a spacing complaint would
 * have had to be fixed five times.
 *
 * ── the two variants, and why it is not one ─────────────────────────────────
 *
 * `read` is for a page that says something and offers a way onward: a
 * confirmation, an expired link, an invitation with nothing to fill in. Those
 * are a few lines, and a few lines pinned to the top of a phone screen look
 * abandoned, so they are centred.
 *
 * `act` is for a page with something to do — a form, a list of install steps.
 * Centring those wastes the top third of the screen on a tall phone and pushes
 * the first thing somebody has to read below where they are looking. They start
 * near the top and scroll like any other document.
 *
 * The old shared value was `justify-center` with `py-24` on both, which on a
 * tall phone left roughly 300px of nothing above an invitation and as much
 * below it.
 */
export function PublicShell({
  variant = "read",
  wide = false,
  children,
}: {
  variant?: "read" | "act";
  /** The join form, which has more fields than the rest have sentences. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main"
      className={`mx-auto flex min-h-[100dvh] flex-col px-6 ${
        wide ? "max-w-[550.8px]" : "max-w-[453.6px]"
      } ${variant === "read" ? "justify-center py-24" : "pt-10 pb-16"}`}
    >
      <Wordmark className="text-[24.3px]" />
      {children}
    </main>
  );
}

/**
 * The wordmark: a raised plus set tight against a large One (§3.1).
 *
 * Four hand-written copies drifted in size and colour. `asLink` is the default
 * because every place it appears outside the masthead should return home.
 *
 * ── the plus is 0.90em, and that is deliberate ──────────────────────────────
 *
 * §3.1 asks for a "small superscript plus", and this is not small — it was
 * 0.42em until Kevin sized it by eye against the real faces on 2026-08-28. The
 * rest of that sentence is why: the mark should be "a typographic detail on
 * first glance, an identity marker on second look", and at 0.42em it managed
 * the first and never the second.
 *
 * `align-super` went with it. That is a fixed browser offset, so a plus this
 * size stops clearing the cap height cleanly and collides with the O; the rise
 * is stated explicitly instead. Note it resolves against this span's OWN font
 * size, so 0.30em here is 0.27em of the One.
 */
export function Wordmark({
  className = "text-[21.1px]",
  asLink = true,
}: {
  className?: string;
  asLink?: boolean;
}) {
  const mark = (
    <span className={`font-display leading-none tracking-[-0.02em] ${className}`}>
      <span className="align-[0.30em] text-[0.90em] text-accent">+</span>One
    </span>
  );

  return asLink ? (
    <Link href="/" aria-label="Plus One, home">
      {mark}
    </Link>
  ) : (
    mark
  );
}

/**
 * What a list says when it is empty.
 *
 * Every list in the app branched on length except the two conversation
 * surfaces — and an empty chat is guaranteed at creation, so the first thing
 * both people saw after matching was a blank rectangle.
 */
/**
 * A small filled label sitting on top of something else.
 *
 * Here because the first one written — "Main", over a photo — spelled the
 * accent fill and its ink by hand, which is precisely the duplication this file
 * exists to end. It reads as the primary tone because it marks the ONE item
 * that matters in a set, and there is exactly one per set.
 */
export function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded bg-accent px-1.5 py-0.5 text-[11px] tracking-[0.03em] text-accent-ink uppercase ${className}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <Card className="mt-8">
      {/* A heading, so somebody navigating by heading learns there is nothing
          here rather than landing on an unexplained paragraph. */}
      <h2 className="text-h3">{heading}</h2>
      <p className="mt-3 text-body leading-[1.7] text-ink-2">{body}</p>
    </Card>
  );
}
