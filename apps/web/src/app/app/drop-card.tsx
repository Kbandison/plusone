import Link from "next/link";

import { COPY, DRAFT_COPY } from "@plusone/config";

import type { DropCard as Card, PreviewCard } from "@/lib/drop";

/**
 * A full drop card, for a dating-mode member.
 *
 * Takes `DropCard` specifically. A `PreviewCard` will not typecheck here, which
 * is how the redaction survives a refactor — the two are different shapes, not
 * one shape rendered two ways.
 */
export function FullCard({ card }: { card: Card }) {
  const meta = [card.age, card.distanceMi != null ? `${card.distanceMi} mi` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-xl border border-line-2 bg-surface p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[1.45rem]">{card.displayName}</h2>
        {meta ? <span className="text-[14.5px] text-ink-3">{meta}</span> : null}
      </div>

      {card.intention ? <p className="mt-3 text-[15px] text-ink-2">{card.intention}</p> : null}

      {/* Decision #14 — a connect is a reply to a prompt, so this goes to a
          compose screen rather than sending anything. An earlier version POSTed
          straight to an RPC with a null prompt_id, which the NOT NULL column
          would have refused: the button could never have worked. */}
      <Link
        href={`/app/connect/${card.id}?source=drop`}
        className="ease-brand mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90"
      >
        {DRAFT_COPY.app.connectLabel}
      </Link>
    </li>
  );
}

/**
 * A Preview Drop card (§6.1 step 5, Decision #19).
 *
 * Real local people, with the identifying parts removed before they ever left
 * the database. The only action is the one that turns a preview into a real
 * card — there is no connect button, because a support-only member cannot send
 * one and offering it would be a door that opens onto a wall.
 */
export function PreviewDropCard({ card }: { card: PreviewCard }) {
  const meta = [
    card.ageBand,
    card.distanceBucketMi != null ? `within ${card.distanceBucketMi} mi` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-xl border border-line-2 bg-surface p-6">
      <div className="flex items-center gap-4">
        {/* Stands in for a photo the viewer is not entitled to. It is a shape,
            not a blurred image — there is no image in the payload to blur. */}
        <div aria-hidden className="size-14 shrink-0 rounded-full bg-surface-2" />
        <div>
          <p className="text-[1.1rem]">{meta || "Someone nearby"}</p>
          {card.intention ? (
            <p className="mt-1 text-[14.5px] text-ink-2">{card.intention}</p>
          ) : null}
        </div>
      </div>

      {/* §3.4, verbatim. */}
      <p className="mt-5 text-[14.5px] text-accent">{COPY.supportOnly.previewCta}</p>
    </li>
  );
}
