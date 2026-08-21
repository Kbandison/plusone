import type { Metadata } from "next";

import { CONNECTS, COPY, DRAFT_COPY, DROP } from "@plusone/config";
import { drop as dropLogic } from "@plusone/logic";

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

  /**
   * What a connect costs, and when the next three land.
   *
   * Decision #15's whole nudge — a drop connect is free, a Browse one is not —
   * has been true in the trigger since Milestone 1 and stated nowhere a member
   * could read it.
   *
   * Skipped entirely for a preview: a support-only member cannot send a connect
   * at all, so a budget is a number about something they cannot do.
   */
  const [{ data: budgetRow }, { data: isPremium }] = drop.preview
    ? [{ data: null }, { data: null }]
    : await Promise.all([
        supabase
          .from("connect_budgets")
          // `day` is written by the trigger as `current_date`, which is the
          // database's date. Matching it here rather than the member's local
          // one, so the two agree about which day it is.
          .select("connects_used")
          .eq("user_id", data.user.id)
          .eq("day", new Date().toISOString().slice(0, 10))
          .maybeSingle(),
        supabase.rpc("i_am_premium"),
      ]);

  const perDay = isPremium ? CONNECTS.premiumPerDay : CONNECTS.freePerDay;
  const left = Math.max(0, perDay - ((budgetRow?.connects_used as number | null) ?? 0));

  // Now that a night actually runs from DROP.hourLocal, this is a true sentence
  // rather than a claim about a schedule nothing kept.
  const { data: whereIAm } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", data.user.id)
    .maybeSingle();

  const nextDropTonight = dropLogic.nextDropIsToday(
    new Date(),
    (whereIAm?.timezone as string | null) ?? "UTC",
    DROP.hourLocal,
  );
  const dropClock = dropLogic.clockLabel(DROP.hourLocal);

  return (
    <main id="main">
      <h1 className="text-h2">{COPY.drop.header}</h1>

      {/* §6.1 step 2 — the honesty line, shown whenever the search went wider
          than the member asked for. Quietly widening is how apps pretend to be
          busier than they are. */}
      {drop.radiusExpanded ? (
        <p className="mt-4 text-[12.2px] text-ink-2">
          {COPY.radius.expansionNotice(drop.memberRadiusMi, drop.radiusUsedMi)}
        </p>
      ) : null}

      {drop.cards.length === 0 ? (
        <div className="mt-10 rounded-xl border border-line-2 bg-surface p-8">
          {/* A heading, so someone navigating by heading finds out there is
              nothing tonight rather than landing on an unexplained paragraph. */}
          <h2 className="text-[0.972rem]">{DRAFT_COPY.app.dropEmptyHeading}</h2>
          {/* §3.4, verbatim — an honest empty state rather than padding. */}
          <p className="mt-3 text-[13px] leading-[1.7] text-ink-2">{COPY.drop.thin}</p>
          {/* "Check back tomorrow" is in the line above; this says when. */}
          <p className="mt-4 text-[12.2px] text-ink-3">
            {nextDropTonight
              ? DRAFT_COPY.app.dropNextTonight(dropClock)
              : DRAFT_COPY.app.dropNextTomorrow(dropClock)}
          </p>
        </div>
      ) : drop.preview ? (
        <>
          {/* Decision #19 — density stats and mechanics explainers on the same
              screen as the preview. Without them a support-only member is shown
              three redacted cards and asked to give up a shield to see them,
              with nothing to weigh that against. */}
          <p className="mt-6 text-[12.2px] text-ink-2">
            {DRAFT_COPY.app.previewDensity(drop.poolSize, drop.radiusUsedMi)}
          </p>

          <ul className="rise-in mt-8 flex flex-col gap-5">
            {drop.cards.map((card) => (
              <PreviewDropCard key={card.id} card={card} photo={photos.get(card.id)} />
            ))}
          </ul>

          <section className="mt-10 rounded-xl border border-line-2 bg-surface p-6">
            <h2 className="text-[0.891rem]">{DRAFT_COPY.app.previewHowHeading}</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {DRAFT_COPY.app.previewHow.map((line) => (
                <li key={line} className="text-[12.2px] leading-[1.65] text-ink-2">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          {/* What a reply here costs, which is nothing — and what one anywhere
              else costs, which is one of a few. Decision #15 nudges toward
              curation over browsing and this is the first time the app has said
              so out loud. Above the cards, because it is a reason to read them
              carefully rather than a footnote about them. */}
          <p className="mt-6 text-[12.2px] leading-[1.6] text-ink-2">
            {DRAFT_COPY.app.dropConnectsFree}{" "}
            <span className="text-ink-3">
              {left === 0
                ? DRAFT_COPY.app.dropBudgetNone
                : DRAFT_COPY.app.dropBudgetLeft(left, perDay)}
            </span>
          </p>

          <ul className="rise-in mt-8 flex flex-col gap-5">
            {drop.cards.map((card) => (
              <FullCard key={card.id} card={card} photo={photos.get(card.id)} />
            ))}
          </ul>

          {/* When the next three land. The rhythm is the product — it is why
              there is no infinite feed here — and the screen it happens on
              never said when. */}
          <p className="mt-8 text-[12.2px] text-ink-2">
            {nextDropTonight
              ? DRAFT_COPY.app.dropNextTonight(dropClock)
              : DRAFT_COPY.app.dropNextTomorrow(dropClock)}
          </p>

          {/* Once, under the list, rather than on every card. A percentage with
              no stated basis invites a member to read it as a measurement of
              two people; it is intention and twelve questions, and saying so is
              the difference between a hint and a claim. */}
          <p className="mt-4 text-[11px] leading-[1.6] text-ink-3">
            {DRAFT_COPY.app.compatibilityNote}
          </p>
        </>
      )}
    </main>
  );
}
