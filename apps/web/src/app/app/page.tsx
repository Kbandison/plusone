import type { Metadata } from "next";

import { COPY, DRAFT_COPY } from "@plusone/config";

import { getTonightsDrop } from "@/lib/drop";
import { photosFor, previewPhotosFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { FullCard, PreviewDropCard } from "./drop-card";
import { redirect } from "next/navigation";

// COPY.drop.header is spec copy (§3.4). DRAFT_COPY must never shadow it.
export const metadata: Metadata = { title: COPY.drop.header };

export default async function TonightPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");
  const drop = await getTonightsDrop(data.user.id);
  // The preview reads a different view, one that cannot return a clear path.
  // Calling photosFor() for both variants is what put a fully identifiable
  // photograph above "30–39 · within 10 mi" on a screen that promised blurred.
  const ids = drop.cards.map((c) => c.id);
  const photos = drop.preview ? await previewPhotosFor(ids) : await photosFor(ids);

  return (
    <main id="main">
      <h1 className="text-h2">{COPY.drop.header}</h1>

      {/* §6.1 step 2 — the honesty line, shown whenever the search went wider
          than the member asked for. Quietly widening is how apps pretend to be
          busier than they are. */}
      {drop.radiusExpanded ? (
        <p className="mt-4 text-[15px] text-ink-2">
          {COPY.radius.expansionNotice(drop.memberRadiusMi, drop.radiusUsedMi)}
        </p>
      ) : null}

      {drop.cards.length === 0 ? (
        <div className="mt-10 rounded-xl border border-line-2 bg-surface p-8">
          {/* A heading, so someone navigating by heading finds out there is
              nothing tonight rather than landing on an unexplained paragraph. */}
          <h2 className="text-[1.2rem]">{DRAFT_COPY.app.dropEmptyHeading}</h2>
          {/* §3.4, verbatim — an honest empty state rather than padding. */}
          <p className="mt-3 text-[16px] leading-[1.7] text-ink-2">{COPY.drop.thin}</p>
        </div>
      ) : drop.preview ? (
        <>
          {/* Decision #19 — density stats and mechanics explainers on the same
              screen as the preview. Without them a support-only member is shown
              three redacted cards and asked to give up a shield to see them,
              with nothing to weigh that against. */}
          <p className="mt-6 text-[15px] text-ink-2">
            {DRAFT_COPY.app.previewDensity(drop.poolSize, drop.radiusUsedMi)}
          </p>

          <ul className="mt-8 flex flex-col gap-5">
            {drop.cards.map((card) => (
              <PreviewDropCard key={card.id} card={card} photo={photos.get(card.id)} />
            ))}
          </ul>

          <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
            <h2 className="text-[1.1rem]">{DRAFT_COPY.app.previewHowHeading}</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {DRAFT_COPY.app.previewHow.map((line) => (
                <li key={line} className="text-[15px] leading-[1.65] text-ink-2">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          <ul className="mt-8 flex flex-col gap-5">
            {drop.cards.map((card) => (
              <FullCard key={card.id} card={card} photo={photos.get(card.id)} />
            ))}
          </ul>

          {/* Once, under the list, rather than on every card. A percentage with
              no stated basis invites a member to read it as a measurement of
              two people; it is intention and twelve questions, and saying so is
              the difference between a hint and a claim. */}
          <p className="mt-6 text-[13.5px] leading-[1.6] text-ink-3">
            {DRAFT_COPY.app.compatibilityNote}
          </p>
        </>
      )}
    </main>
  );
}
