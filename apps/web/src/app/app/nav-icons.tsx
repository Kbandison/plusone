/**
 * The five bottom-bar marks.
 *
 * Drawn to the grammar the chat icons already set — 24px box, no fill,
 * `currentColor`, 1.6 stroke, round caps and joins — so the bar and the
 * composer look like one hand drew them. `currentColor` is the load-bearing
 * part: the active state is a colour change on the link, and an icon with a
 * baked fill would ignore it.
 *
 * Set A of the two that were mocked up, with one substitution Kevin made: Rooms
 * is Set B's pair of speech bubbles rather than a group of people. The group
 * icon was the busiest of the five at 22px — three heads and two shoulder arcs
 * inside a 22px box — and two overlapping bubbles say "conversations" where the
 * crowd said "people", which is nearer what a room is.
 *
 * Sized by the caller. These take no props on purpose: a size prop invites one
 * caller to pass something off the scale, and every use here is the same 22px.
 */

const box = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
  className: "size-[22px] shrink-0",
} as const;

/** A crescent. Says night, which is when the Drop lands. */
export function TonightIcon() {
  return (
    <svg {...box}>
      <path d="M20 14.3A8.4 8.4 0 0 1 9.7 4a6.9 6.9 0 1 0 10.3 10.3Z" />
    </svg>
  );
}

/** A magnifier, because Browse is a search with filters on it. */
export function BrowseIcon() {
  return (
    <svg {...box}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

/**
 * One speech bubble. The badge anchors to its top-right, so the tail is on the
 * bottom-left where it cannot collide with a two-digit count.
 */
export function InboxIcon() {
  return (
    <svg {...box}>
      <path d="M4 7.2A2.7 2.7 0 0 1 6.7 4.5h10.6A2.7 2.7 0 0 1 20 7.2v6.6a2.7 2.7 0 0 1-2.7 2.7H9.3L4.6 20a.4.4 0 0 1-.6-.3Z" />
    </svg>
  );
}

/**
 * Two bubbles, one behind the other — Set B's, at Kevin's ask.
 *
 * A room is more than one voice, and the second bubble is what says so. The
 * alternative was a group of people, which at this size is three heads and two
 * shoulder arcs and reads as a smudge on a phone.
 */
export function RoomsIcon() {
  return (
    <svg {...box}>
      <path d="M3.4 6.6A2.2 2.2 0 0 1 5.6 4.4h7.6a2.2 2.2 0 0 1 2.2 2.2v3.4a2.2 2.2 0 0 1-2.2 2.2H7.4l-3.6 2.7a.35.35 0 0 1-.4-.28Z" />
      <path d="M8.6 15.4v.8a2.2 2.2 0 0 0 2.2 2.2h5l3.2 2.4a.35.35 0 0 0 .56-.28v-6.4a2.2 2.2 0 0 0-2.2-2.2h-1.6" />
    </svg>
  );
}

/** A person. The only one of the five that cannot be misread. */
export function ProfileIcon() {
  return (
    <svg {...box}>
      <circle cx="12" cy="8.4" r="3.4" />
      <path d="M5.2 19.4a6.8 6.8 0 0 1 13.6 0" />
    </svg>
  );
}

/**
 * By href, because that is what the nav already keys on.
 *
 * A map rather than a field on each NAV entry: the nav array lives in a server
 * component and these are elements, so putting them there would drag JSX into
 * a file that is otherwise a list of routes and labels.
 */
export const NAV_ICONS: Record<string, () => React.JSX.Element> = {
  "/app": TonightIcon,
  "/app/browse": BrowseIcon,
  "/app/inbox": InboxIcon,
  "/app/rooms": RoomsIcon,
  "/app/profile": ProfileIcon,
};
