import type { Metadata } from "next";

import { COPY, DRAFT_COPY } from "@plusone/config";

import { getTonightsDrop } from "@/lib/drop";
import { getServerSupabase } from "@/lib/supabase";
import { DropCard } from "./drop-card";

// COPY.drop.header is spec copy (§3.4). DRAFT_COPY must never shadow it.
export const metadata: Metadata = { title: COPY.drop.header };

export default async function TonightPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  const drop = await getTonightsDrop(data.user!.id);

  return (
    <main id="main">
      <h1 className="text-[clamp(1.9rem,5.5vw,2.4rem)]">{COPY.drop.header}</h1>

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
          <h2 className="text-[1.3rem]">{DRAFT_COPY.app.dropEmptyHeading}</h2>
          {/* §3.4, verbatim — an honest empty state rather than padding. */}
          <p className="mt-4 text-[16px] leading-[1.7] text-ink-2">{COPY.drop.thin}</p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-5">
          {drop.cards.map((card) => (
            <DropCard key={card.id} card={card} preview={drop.preview} />
          ))}
        </ul>
      )}
    </main>
  );
}
