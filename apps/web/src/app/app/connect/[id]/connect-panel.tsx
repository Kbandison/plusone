import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  DRAFT_COPY,
  INTENTION_LABELS,
  type Intention,
  type ProfilePromptAnswer,
} from "@plusone/config";

import { buttonClass } from "@/app/ui";
import { galleryFor } from "@/lib/photo-urls";
import { getServerSupabase } from "@/lib/supabase";
import { MemberPhotoFrame } from "../../member-photo";
import { MemberTraitChips } from "../../member-traits";
import { ConnectForm } from "./connect-form";

const C = DRAFT_COPY.app;

type Standing =
  | { readonly kind: "none" }
  | { readonly kind: "connected"; readonly chatId: string | null }
  | { readonly kind: "waiting_on_them" }
  | { readonly kind: "waiting_on_you" };

/**
 * Where the viewer stands with this person, which decides what goes under
 * their profile.
 *
 * The form was rendered for everybody — including the person you are already
 * talking to, reached from the chat header or from their Browse card — and a
 * connect to somebody you have one with can only fail on submit. Accepted wins
 * over pending; declined and expired leave the form, as before.
 *
 * Filtered on `target.id`, never on the raw route param: the id goes into a
 * PostgREST `or` expression, and the one that came back from visible_profiles
 * has already been a uuid to Postgres.
 */
async function standingWith(me: string, other: string): Promise<Standing> {
  const supabase = await getServerSupabase();
  const { data: connects } = await supabase
    .from("connects")
    .select("id, initiator_id, status")
    .or(
      `and(initiator_id.eq.${me},target_id.eq.${other}),and(initiator_id.eq.${other},target_id.eq.${me})`,
    )
    .in("status", ["accepted", "pending"]);

  const accepted = connects?.find((c) => c.status === "accepted");
  if (accepted) {
    const { data: chat } = await supabase
      .from("chats")
      .select("id")
      .eq("connect_id", accepted.id as string)
      .maybeSingle();
    return { kind: "connected", chatId: (chat?.id as string | undefined) ?? null };
  }

  const pending = connects?.find((c) => c.status === "pending");
  if (pending) {
    return pending.initiator_id === me ? { kind: "waiting_on_them" } : { kind: "waiting_on_you" };
  }
  return { kind: "none" };
}

/**
 * Somebody's profile, and replying to one of their prompts (Decision #14).
 *
 * Its own component because it is rendered twice: as the page, and as the
 * intercepted route that opens over the Drop, Browse, a room or a chat. Two
 * copies of a screen that decides who can reach whom is two places for that
 * rule to drift.
 */
export async function ConnectPanel({
  id,
  source = "browse",
  room,
}: {
  id: string;
  source?: string | undefined;
  room?: string | undefined;
}) {
  const supabase = await getServerSupabase();

  // Read through visible_profiles, so a member who cannot see this person
  // cannot reach the compose screen either — a 404 rather than a form that
  // fails on submit.
  const { data: target } = await supabase
    .from("visible_profiles")
    .select(
      "id, display_name, age, distance_mi, intention, bio, prompts, smokes, drinks, kids, kids_plan, height_cm, relationship_structure, exercise, diet, pets, education, work, languages, religion, politics",
    )
    .eq("id", id)
    .maybeSingle();

  if (!target) notFound();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // The whole gallery, not one face (BACKLOG 27d). galleryFor reads
  // visible_profile_photos like the cards do, so per-photo privacy and the
  // connection state decide what comes back — this screen decides nothing.
  const [gallery, standing] = await Promise.all([
    galleryFor(target.id as string),
    standingWith(auth.user.id, target.id as string),
  ]);

  // The same line the Browse card carries, in the same order, so a member
  // arriving here from the grid reads the person rather than a second summary
  // of them.
  const meta = [
    target.age,
    target.distance_mi != null ? `${target.distance_mi} mi` : null,
    target.intention ? INTENTION_LABELS[target.intention as Intention] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* The photo leads, at the size the Drop card gives it.
       *
       * It was a 56px circle beside the name, and the rest of the gallery came
       * after it in a grid — so somebody with one photo was never shown bigger
       * than a thumbnail, on the screen where you decide whether to reach out,
       * and on the one a chat now opens to see who you are talking to.
       *
       * Nothing is decided here. A photo the viewer may not see clearly arrives
       * already blurred — the view swaps in a different OBJECT rather than a CSS
       * filter — and one they may not see at all never arrives, so there is no
       * client-side gate that could be got round. */}
      {gallery[0] ? (
        <MemberPhotoFrame photo={gallery[0]} fill className="aspect-[4/5] w-full rounded-xl" />
      ) : null}

      <div className={gallery[0] ? "mt-5" : ""}>
        <h1 className="text-h2">{target.display_name as string}</h1>
        {meta ? <p className="mt-1 text-[11.7px] text-ink-3">{meta}</p> : null}
        {/* Said where it applies. The Drop and Browse cards carry this line,
            and without it here a blurred photo reads as one that failed to
            load. */}
        {gallery.some((photo) => photo.isBlurred) ? (
          <p className="mt-2 text-[11px] text-ink-3">{C.photoBlurredNote}</p>
        ) : null}
      </div>

      {/* Everything they said about themselves. No max: this is a full screen,
          not a two-column card, and there are only ever four. */}
      {target.bio ? (
        <p className="mt-6 text-[13px] leading-[1.7] text-ink-2">{target.bio as string}</p>
      ) : null}
      <MemberTraitChips member={target} className="mt-4" />

      {/* The rest of the gallery, as large as the first. The first is not
          repeated — it is the photo this screen opened on. */}
      {gallery.length > 1 ? (
        <ul className="mt-6 flex flex-col gap-3">
          {/* No emptyLabel: galleryFor drops any photo whose URL failed to
              sign, so every entry here has an image and the empty branch is
              unreachable. Passing one would also trip exactOptionalPropertyTypes
              on the undefined arm. */}
          {gallery.slice(1).map((photo) => (
            <li key={photo.url}>
              <MemberPhotoFrame photo={photo} fill className="aspect-[4/5] w-full rounded-xl" />
            </li>
          ))}
        </ul>
      ) : null}

      {standing.kind === "connected" ? (
        standing.chatId ? (
          <Link
            href={`/app/chats/${standing.chatId}`}
            className={buttonClass("primary", "mt-8 inline-flex")}
          >
            {C.connectOpenChat}
          </Link>
        ) : null
      ) : standing.kind === "waiting_on_them" ? (
        <p className="mt-8 text-[13px] leading-[1.7] text-ink-2">{C.connectWaitingOnThem}</p>
      ) : standing.kind === "waiting_on_you" ? (
        <>
          <p className="mt-8 text-[13px] leading-[1.7] text-ink-2">{C.connectWaitingOnYou}</p>
          <Link href="/app/inbox" className={buttonClass("secondary", "mt-4 inline-flex")}>
            {C.connectGoToInbox}
          </Link>
        </>
      ) : (
        <>
          <h2 className="mt-8 text-[0.931rem]">{C.connectHeading}</h2>
          <p className="mt-4 text-[13px] leading-[1.7] text-ink-2">{C.connectIntro}</p>

          <ConnectForm
            targetId={target.id as string}
            prompts={(target.prompts ?? []) as ProfilePromptAnswer[]}
            source={source === "drop" || source === "room" ? source : "browse"}
            roomId={room ?? null}
          />
        </>
      )}
    </>
  );
}
