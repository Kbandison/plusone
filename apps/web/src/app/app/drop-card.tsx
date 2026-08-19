import Link from "next/link";

import { COPY, DRAFT_COPY, INTENTION_LABELS, type Intention } from "@plusone/config";

import type { DropCard as Card, PreviewCard } from "@/lib/drop";
import type { MemberPhoto } from "@/lib/photo-urls";
import { MemberPhotoFrame } from "./member-photo";
import { Badge, buttonClass } from "@/app/ui";

/**
 * The enum is a database value, not something to show a member. Rendering
 * `card.intention` raw put "long_term" on the card — readable, but obviously
 * machine output, and the first thing anyone sees of another person.
 */
function intentionLabel(intention: string | null): string | null {
  if (!intention) return null;
  return INTENTION_LABELS[intention as Intention] ?? null;
}

/**
 * A full drop card, for a dating-mode member.
 *
 * Takes `DropCard` specifically. A `PreviewCard` will not typecheck here, which
 * is how the redaction survives a refactor — the two are different shapes, not
 * one shape rendered two ways.
 */
export function FullCard({ card, photo }: { card: Card; photo?: MemberPhoto | undefined }) {
  const meta = [card.age, card.distanceMi != null ? `${card.distanceMi} mi` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    // The photo leads.
    //
    // It was a 64px thumbnail beside a name, which is the shape of a search
    // result — three of them read as a list of records rather than as three
    // people chosen for tonight. Decision #11 serves exactly three, so each one
    // can afford the room.
    <li className="overflow-hidden rounded-xl border border-line-2 bg-surface">
      <div className="relative">
        <MemberPhotoFrame photo={photo} fill className="aspect-[4/5] w-full" />

        {/* Over the photo rather than under the name: it is the first thing
            worth knowing about a card that was chosen rather than searched. */}
        {card.compatibility != null ? (
          <Badge className="absolute top-3 right-3">
            {DRAFT_COPY.app.compatibilityLabel(card.compatibility)}
          </Badge>
        ) : null}
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[1.175rem]">{card.displayName}</h2>
          {meta ? <span className="text-[11.7px] text-ink-3">{meta}</span> : null}
        </div>

        {intentionLabel(card.intention) ? (
          <p className="mt-2 text-[12.2px] text-ink-2">{intentionLabel(card.intention)}</p>
        ) : null}

        {photo?.isBlurred ? (
          <p className="mt-3 text-[11px] text-ink-3">{DRAFT_COPY.app.photoBlurredNote}</p>
        ) : null}

        {/* Something they said, not another measurement of them. Decision #14
            makes a connect a reply to a prompt, so this is also the thing the
            next screen will ask about — seeing it here is what makes that
            screen make sense. */}
        {card.prompt ? (
          <figure className="mt-5 border-l-2 border-line-2 pl-4">
            <figcaption className="text-[11px] tracking-[0.02em] text-ink-3 uppercase">
              {card.prompt.question}
            </figcaption>
            <blockquote className="mt-1.5 text-[13px] leading-[1.6] text-ink">
              {card.prompt.answer}
            </blockquote>
          </figure>
        ) : null}

        {/* Decision #14 — a connect is a reply to a prompt, so this goes to a
            compose screen rather than sending anything. An earlier version
            POSTed straight to an RPC with a null prompt_id, which the NOT NULL
            column would have refused: the button could never have worked. */}
        <Link
          href={`/app/connect/${card.id}?source=drop`}
          className={buttonClass("primary", "mt-6 inline-block")}
        >
          {DRAFT_COPY.app.connectLabel}
        </Link>
      </div>
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
export function PreviewDropCard({
  card,
  photo,
}: {
  card: PreviewCard;
  photo?: MemberPhoto | undefined;
}) {
  const meta = [
    card.ageBand,
    card.distanceBucketMi != null ? `within ${card.distanceBucketMi} mi` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-xl border border-line-2 bg-surface p-6">
      <div className="flex items-center gap-4">
        {/* Whatever preview_profiles allowed. Where there is no entitled photo
            this is a shape rather than a blurred one — there is no image in the
            payload to blur. */}
        <MemberPhotoFrame photo={photo} size={56} />
        <div>
          <p className="text-[0.891rem]">{meta || "Someone nearby"}</p>
          {intentionLabel(card.intention) ? (
            <p className="mt-1 text-[11.7px] text-ink-2">{intentionLabel(card.intention)}</p>
          ) : null}
          {/* Decision #19 lists compat% among the things a preview DOES show —
              it is what makes the redacted card worth looking at. */}
          {card.compatibility != null ? (
            <p className="mt-1.5 text-[11.7px] text-accent">
              {DRAFT_COPY.app.compatibilityLabel(card.compatibility)}
            </p>
          ) : null}
        </div>
      </div>

      {/* §3.4, verbatim — and a link, because it reads as one.
       *
       * It was an accent-coloured <p>: it looked like a call to action, said
       * "Switch to dating to see and connect", and did nothing at all. Not
       * focusable, so a keyboard user never even met it.
       *
       * It goes to the profile rather than switching mode on the spot. Leaving
       * support-only is a real decision with a thirty-day road back, and a
       * one-tap version of it on a card is the kind of control people hit by
       * accident. previewCtaAria has been sitting unused in DRAFT_COPY since
       * this was designed. */}
      <Link
        href="/app/profile"
        aria-label={DRAFT_COPY.app.previewCtaAria}
        className="ease-brand mt-5 inline-block text-[11.7px] text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
      >
        {COPY.supportOnly.previewCta}
      </Link>
    </li>
  );
}
