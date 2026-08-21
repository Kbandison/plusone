import type { Metadata } from "next";

import { CONNECTS, COPY, DRAFT_COPY } from "@plusone/config";
import { connects as connectsLogic } from "@plusone/logic";

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
   * What you already have with tonight's three, and what a connect costs.
   *
   * Neither existed on this screen. A drop excludes anyone you have connected
   * with, but a REPLAYED drop reads back the ids it served earlier — so
   * reopening the app after accepting one of tonight's showed the same card
   * with the same Connect button for somebody you were already talking to.
   *
   * And Decision #15's whole nudge — a drop connect is free, a Browse one is
   * not — has been true in the trigger since Milestone 1 and stated nowhere a
   * member could read it.
   *
   * Skipped entirely for a preview: a support-only member cannot send a
   * connect at all, so a budget is a number about something they cannot do.
   */
  const [{ data: myConnects }, { data: budgetRow }, { data: isPremium }] = drop.preview
    ? [{ data: null }, { data: null }, { data: null }]
    : await Promise.all([
        supabase
          .from("connects")
          .select("initiator_id, target_id, status")
          .or(`initiator_id.eq.${data.user.id},target_id.eq.${data.user.id}`),
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

  const HISTORY_LABEL: Record<string, string> = {
    waiting_on_you: DRAFT_COPY.app.threadNeedsDecision,
    waiting_on_them: DRAFT_COPY.app.threadSentWaiting,
    talking: DRAFT_COPY.app.browseTalking,
    past: DRAFT_COPY.app.browsePast,
  };

  const history = new Map<string, { label: string; live: boolean }>();
  for (const row of myConnects ?? []) {
    const initiated = (row.initiator_id as string) === data.user.id;
    const them = initiated ? (row.target_id as string) : (row.initiator_id as string);
    const state = connectsLogic.historyWith(row.status as connectsLogic.ConnectStatus, initiated);
    // A live connect outranks a finished one when there are several: "Connected
    // before" on somebody waiting for your answer right now is worse than
    // saying nothing.
    if (state !== "past" || !history.has(them)) {
      history.set(them, { label: HISTORY_LABEL[state]!, live: state !== "past" });
    }
  }

  const perDay = isPremium ? CONNECTS.premiumPerDay : CONNECTS.freePerDay;
  const left = Math.max(0, perDay - ((budgetRow?.connects_used as number | null) ?? 0));

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
              <FullCard
                key={card.id}
                card={card}
                photo={photos.get(card.id)}
                history={history.get(card.id)}
              />
            ))}
          </ul>

          {/* Once, under the list, rather than on every card. A percentage with
              no stated basis invites a member to read it as a measurement of
              two people; it is intention and twelve questions, and saying so is
              the difference between a hint and a claim. */}
          <p className="mt-6 text-[11px] leading-[1.6] text-ink-3">
            {DRAFT_COPY.app.compatibilityNote}
          </p>
        </>
      )}
    </main>
  );
}
