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
  primary: "bg-accent text-accent-ink hover:opacity-90 active:scale-[0.995] disabled:opacity-55",
  secondary: "border border-line-control text-ink hover:border-accent disabled:opacity-55",
  quiet:
    "text-ink-2 underline decoration-line-control underline-offset-4 hover:text-ink disabled:opacity-55",
  danger:
    "border border-line-control text-ink hover:border-critical hover:text-critical disabled:opacity-55",
};

const SHAPE =
  "ease-brand inline-flex min-h-tap items-center justify-center rounded-lg px-5 text-body-sm transition-[opacity,transform,border-color,color] duration-200";

export function buttonClass(tone: ButtonTone = "primary", extra = ""): string {
  const shape =
    tone === "quiet"
      ? "ease-brand inline-flex min-h-tap items-center text-body-sm transition-colors duration-200"
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
 * The wordmark: a small superscript plus set tight against a large One (§3.1).
 *
 * Four hand-written copies drifted in size and colour. `asLink` is the default
 * because every place it appears outside the masthead should return home.
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
      <span className="align-super text-[0.42em] text-accent">+</span>One
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
