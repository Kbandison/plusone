import { COPY, DRAFT_COPY } from "@plusone/config";

import type { DropCard as Card } from "@/lib/drop";

/**
 * One drop card.
 *
 * The preview variant (§6.1 step 5, Decision #19) hides the name and shows an
 * age band and a distance bucket instead of an age and a distance. That
 * redaction happens in `preview_profiles` in SQL for the data path; here it is
 * about which fields are rendered, and the card is given only what it may show.
 */
export function DropCard({ card, preview }: { card: Card; preview: boolean }) {
  return (
    <li className="rounded-xl border border-line-2 bg-surface p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[1.45rem]">
          {preview ? (card.ageBand ?? "Someone nearby") : (card.displayName ?? "Someone")}
        </h2>
        <span className="text-[14.5px] text-ink-3">
          {preview
            ? null
            : [card.age, card.distanceMi != null ? `${card.distanceMi} mi` : null]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </div>

      {card.intention ? <p className="mt-3 text-[15px] text-ink-2">{card.intention}</p> : null}

      {preview ? (
        // §3.4, verbatim. A preview card's only action is the one that turns it
        // into a real one.
        <p className="mt-5 text-[14.5px] text-accent">{COPY.supportOnly.previewCta}</p>
      ) : (
        <form action="/app/connect" method="post" className="mt-5">
          <input type="hidden" name="target_id" value={card.id} />
          <button
            type="submit"
            className="ease-brand rounded-lg bg-accent px-5 py-2.5 text-[15px] text-accent-ink transition-opacity duration-200 hover:opacity-90"
          >
            {DRAFT_COPY.app.connectLabel}
          </button>
        </form>
      )}
    </li>
  );
}
