#!/usr/bin/env node
/**
 * Every unreviewed string in the product, on one page Kevin can read.
 *
 * The standing note in PROJECT_UPDATES says which copy is mine rather than
 * Kevin's, and it has said so for a week — but "it's in draft-copy.ts" is not a
 * way to review anything. That file is sixteen hundred lines of TypeScript with
 * the strings scattered through the arguments that keep them honest.
 *
 * So this reads the config package — the actual source of truth, not a copy of
 * it — and renders what a member would see, with a line saying where each one
 * appears. Generated rather than written, so it cannot drift: change a string
 * and re-run, and the review document is current.
 *
 * DELIBERATELY EXCLUDES anything in `COPY`. That is spec-verbatim from §3.4,
 * §3.5 and §9.1 and must not be edited — putting it in a review document
 * invites exactly the edit the rule forbids.
 *
 * Usage:
 *   pnpm copy:review                       → writes copy-review.html
 *   INSTRUMENT_WOFF2=path pnpm copy:review → inlines the display face too
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMMUNITY_GUIDELINES,
  DRAFT_COPY,
  FAQ,
  GUIDELINES_INTRO,
  HOW_IT_WORKS,
  HOW_IT_WORKS_INTRO,
  INTENTION_LABELS,
  MUTABLE_EVENTS,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_LINES,
  NOTIFY_TIMING,
  PRICING_INTRO,
  PRICING_NEVER_NOTE,
  PRIVACY_POLICY,
  PRIVACY_POLICY_INTRO,
  PROFILE_PROMPTS,
  QUIZ_QUESTIONS,
  TERMS,
} from "@plusone/config";

const ROOT = join(import.meta.dirname, "..");

// ── the fonts ────────────────────────────────────────────────────────────────
//
// Inlined as data URIs because a published artifact runs under a CSP that
// blocks every external host — a linked webfont there fails silently and the
// page renders in Times, which is a poor frame for judging whether copy reads
// well.
const dataUri = (path: string) =>
  `url(data:font/woff2;base64,${readFileSync(path).toString("base64")}) format("woff2")`;

const satoshi = (weight: number) =>
  dataUri(join(ROOT, `apps/web/src/app/fonts/satoshi-${weight}.woff2`));

// Instrument Serif comes from Google at build time, so it is not a file in this
// repo. Passed in when there is one; a serif stack when there is not.
const instrumentPath = process.env.INSTRUMENT_WOFF2;
const displayFace = instrumentPath
  ? `@font-face { font-family: "Instrument Serif"; font-style: normal; font-weight: 400; font-display: swap; src: ${dataUri(instrumentPath)}; }`
  : "";
const displayStack = instrumentPath
  ? `"Instrument Serif", ui-serif, Georgia, serif`
  : `ui-serif, Georgia, "Times New Roman", serif`;

// ── shaping the content ──────────────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One string to look at, and where a member meets it. */
interface Item {
  readonly text: string;
  /** Where it appears. Rendered small, above the string. */
  readonly where?: string;
  /** Anything worth knowing before judging it. Rendered small, below. */
  readonly note?: string;
  /** Sub-strings that belong to this one — quiz options, list items. */
  readonly under?: readonly string[];
}

interface Group {
  readonly title: string;
  readonly items: readonly Item[];
}

interface Section {
  readonly id: string;
  readonly title: string;
  /** Why it sits where it does in the order. This is the stakes argument. */
  readonly stakes: string;
  readonly source: string;
  readonly groups: readonly Group[];
}

/**
 * A copy value that takes a runtime value, rendered with a plausible one.
 *
 * Showing `(cents: number) => …` to somebody reviewing words is showing them
 * the plumbing, so each function is CALLED and its sentence printed.
 *
 * The argument is guessed from the parameter's own name, which is the only
 * signal left after TypeScript is stripped. Guessing by arity alone produced
 * "NaN a month" and thirty lines reading "undefined of undefined" — worse than
 * showing nothing, because a reviewer cannot tell a bad sample from bad copy.
 */
function guesses(param: string): unknown[] {
  const n = param.toLowerCase();
  if (/cent|price|amount/.test(n)) return [1699];
  if (/email|address/.test(n)) return ["sam@example.com"];
  if (/date|until|expires|on$/.test(n)) return ["14 September"];
  if (/time|hour|clock/.test(n)) return ["8pm"];
  if (/plan|tier|label|price/.test(n)) return ["Something long term"];
  if (/name|who|person|author|other|query|search|term|word|text|step|room|title|head/.test(n))
    return ["Sam"];
  if (
    /count|days|hours|chars|max|min|left|photos|miles|radius|percent|pct|score|people|likes|comments|replies|attempts|unread|index|total|n$|num/.test(
      n,
    )
  )
    return [3];
  // Unknown: try a number first — most of the remaining ones are counts — then
  // a name, then nothing.
  return [3, "Sam"];
}

/**
 * The parameter names, from the source. Arrow or function, one arg or several.
 *
 * The single-bare-argument form is tried FIRST, and has to be. `heading =>
 * \`Back to ${heading.toLowerCase()}\`` has no parentheses around its
 * parameter but plenty inside its body, so a paren-first regex captures the
 * empty argument list of `toLowerCase()` and reports that the function takes
 * nothing.
 */
function params(fn: (...a: never[]) => unknown): string[] {
  const src = fn.toString();
  const head = /^\s*(\w+)\s*=>/.exec(src) ?? /^[^(]*\(([^)]*)\)/.exec(src);
  if (!head) return [];
  return (head[1] ?? "")
    .split(",")
    .map((p) =>
      p
        .replace(/[:=].*$/, "")
        .replace(/[^\w]/g, "")
        .trim(),
    )
    .filter(Boolean);
}

/** Every combination of the per-parameter guesses, shallowest first. */
function tuples(names: string[]): unknown[][] {
  let out: unknown[][] = [[]];
  for (const name of names) {
    const next: unknown[][] = [];
    for (const g of guesses(name)) for (const prefix of out) next.push([...prefix, g]);
    out = next;
  }
  return out;
}

/** A sample that left a hole in the sentence is not a sample. */
const clean = (s: string) => s.length > 0 && !/undefined|NaN|\[object/.test(s);

function render(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "function") return null;
  const fn = value as (...a: never[]) => unknown;

  for (const args of tuples(params(fn))) {
    try {
      const out = fn(...(args as never[]));
      if (typeof out === "string" && clean(out)) return out;
    } catch {
      /* wrong shape — try the next combination */
    }
  }
  return null;
}

/**
 * Anything the sampler could not produce a sentence for.
 *
 * Printed at the end rather than dropped. A review document that silently omits
 * a string is worse than one that admits it cannot render it — the reviewer has
 * no way to know they were not shown everything.
 */
const unrendered: string[] = [];

/** Walk a DRAFT_COPY sub-object into flat items, nested objects included. */
function walk(obj: Record<string, unknown>, prefix = ""): Item[] {
  const out: Item[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...walk(value as Record<string, unknown>, name));
      continue;
    }
    if (Array.isArray(value)) {
      const strings = value.filter((v): v is string => typeof v === "string");
      if (strings.length) out.push({ text: strings[0]!, where: name, under: strings.slice(1) });
      else unrendered.push(name);
      continue;
    }
    const text = render(value);
    if (text) out.push({ text, where: name });
    else unrendered.push(name);
  }
  return out;
}

/** The prose blocks all share a shape: a title, paragraphs, sometimes a list. */
interface Prose {
  readonly title: string;
  readonly body?: readonly string[];
  readonly list?: readonly string[];
  readonly quoted?: string;
}

const fromProse = (sections: readonly Prose[]): Group[] =>
  sections.map((s) => ({
    title: s.title,
    items: [
      ...(s.body ?? []).map((text, i) => (i === 0 ? { text } : { text })),
      ...(s.quoted ? [{ text: s.quoted, note: "Pulled out as a quote on the page." }] : []),
      ...(s.list ? [{ text: s.list[0]!, under: s.list.slice(1) }] : []),
    ],
  }));

// ── the sections, in the order they are worth arguing about ──────────────────

const CHANNELS = ["in_app", "push", "email"] as const;

/**
 * The events where a person DID cause it and the name is dropped anyway.
 *
 * Worth distinguishing from the ones no person causes, because these are
 * decisions rather than facts — each is a place the product could name somebody
 * and chooses not to, and each is arguable.
 */
const WITHHELD: Record<string, string> = {
  like_received:
    "A person did this, and is deliberately not named. The rooms show a like count and never who — naming them here would invent a disclosure the interface does not make.",
  verification_decided:
    "A moderator decided this, and is deliberately not named. It also never says which way it went: a rejection is not something to learn from a glance at a lock screen.",
  referral_converted:
    "A person did this, and is deliberately not named. Announcing who joined would hand a new member's identity to whoever invited them.",
};

const SECTIONS: Section[] = [
  {
    id: "notifications",
    title: "Notifications",
    stakes:
      "Newest, and the only copy here that is read on a lock screen. The push wording is checked by a test for condition words; the in-app wording is not, because it is behind the login — which makes it the half worth reading closely.",
    source: "packages/config/src/draft-copy.ts and notifications.ts",
    groups: [
      {
        title: "What the list says",
        items: Object.keys(NOTIFICATION_DEFAULTS).map((event) => {
          const line = NOTIFICATION_LINES[event as keyof typeof NOTIFICATION_LINES];
          const named = line("Sam");
          const anon = line(null);
          const note = WITHHELD[event] ?? "Nobody causes this one — it is the app or the clock.";
          return {
            text: anon,
            where: event,
            // The name-carrying ones show both forms, because the reader
            // sometimes cannot see a name and the line has to work either way.
            ...(named === anon ? { note } : { under: [`With a name: ${named}`] }),
          };
        }),
      },
      {
        title: "The switches in Settings",
        items: MUTABLE_EVENTS.map((event) => ({
          text: NOTIFICATION_EVENT_LABELS[event],
          where: event,
          note: `On by default for: ${NOTIFICATION_DEFAULTS[event]
            .map((c) => NOTIFICATION_CHANNEL_LABELS[c])
            .join(", ")}`,
        })).concat([
          {
            text: NOTIFICATION_EVENT_LABELS.verification_decided,
            where: "verification_decided",
            note: "Cannot be turned off. Shown as a line under the grid rather than a row in it.",
          },
        ]),
      },
      {
        title: "Column headings",
        items: CHANNELS.map((c) => ({ text: NOTIFICATION_CHANNEL_LABELS[c], where: c })),
      },
      {
        title: "Timing — a product decision, not copy",
        items: [
          {
            text: `${NOTIFY_TIMING.connectExpiryWarningHours} hours' notice before a connect expires`,
            note: "Matches the fuse warning. The connect itself lasts seven days.",
          },
          {
            text: `${NOTIFY_TIMING.premiumExpiryWarningDays} days' notice before premium lapses`,
            note: "Long enough to act on, short enough not to nag.",
          },
          {
            text: `${NOTIFY_TIMING.nearbyJoinWindowDays} days of new arrivals counts as "new" nearby`,
            note: "Also the most often anyone can be told — once a week.",
          },
        ],
      },
    ],
  },
  {
    id: "quiz",
    title: "Compatibility quiz",
    stakes:
      "First because it is the only copy that decides who is shown to whom. Twelve questions across six traits, and the answers feed the Drop's scoring — so a question that reads ambiguously produces a wrong match rather than an awkward sentence.",
    source: "packages/config/src/draft-copy.ts → QUIZ_QUESTIONS",
    groups: [
      {
        title: `${QUIZ_QUESTIONS.length} questions`,
        items: QUIZ_QUESTIONS.map((q) => ({
          text: q.question,
          where: q.trait,
          under: q.options.map((o) => o.label),
        })),
      },
    ],
  },
  {
    id: "guidelines",
    title: "Community guidelines",
    stakes:
      "Sets what gets somebody removed, so it is the one most worth disagreeing with. It is also the only page here a member may be shown at the worst moment they will have in this product.",
    source: "packages/config/src/guidelines.ts, live at /guidelines",
    groups: [
      { title: "Opening", items: [{ text: GUIDELINES_INTRO }] },
      ...fromProse(COMMUNITY_GUIDELINES as readonly Prose[]),
    ],
  },
  {
    id: "prompts",
    title: "Profile prompts",
    stakes:
      "Load-bearing. Decision #14 makes a connect a reply to a specific prompt, so these are the only opening lines this product has — without them nobody can be reached at all.",
    source: "packages/config/src/draft-copy.ts → PROFILE_PROMPTS",
    groups: [
      {
        title: `${PROFILE_PROMPTS.length} prompts`,
        items: PROFILE_PROMPTS.map((p) => ({ text: p.question, where: p.id })),
      },
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    stakes:
      "Every factual claim in here is asserted against the product by a test, so the risk is tone rather than accuracy. Read it for whether it sounds like you.",
    source: "packages/config/src/guidelines.ts → FAQ, live at /faq",
    groups: FAQ.map((entry) => ({
      title: entry.question,
      items: entry.answer.map((text) => ({ text })),
    })),
  },
  {
    id: "marketing",
    title: "How it works, and pricing",
    stakes:
      "The public pages. The mechanics quoted inside them are §3.4 verbatim and are not up for review; the connecting prose around them is mine.",
    source: "packages/config/src/marketing.ts",
    groups: [
      { title: "Opening", items: [{ text: HOW_IT_WORKS_INTRO }] },
      ...fromProse(HOW_IT_WORKS as readonly Prose[]),
      { title: "Pricing page", items: [{ text: PRICING_INTRO }] },
      { title: "What money never buys", items: [{ text: PRICING_NEVER_NOTE }] },
    ],
  },
  {
    id: "privacy",
    title: "Privacy policy",
    stakes:
      "Needs counsel as well as you (Decision #30). Worth your read regardless: it commits the product to things in your name, and every commitment in it is one I decided to make.",
    source: "packages/config/src/legal.ts, live at /privacy",
    groups: [
      { title: "Opening", items: [{ text: PRIVACY_POLICY_INTRO }] },
      ...fromProse(PRIVACY_POLICY as readonly Prose[]),
    ],
  },
  {
    id: "terms",
    title: "Terms of service",
    stakes:
      "Needs counsel too. Takes two unusual positions on purpose — verification is identity and not character, and there is no content licence — and both are arguable.",
    source: "packages/config/src/terms.ts, live at /terms",
    groups: fromProse(TERMS as readonly Prose[]),
  },
  {
    id: "labels",
    title: "Screen labels and messages",
    stakes:
      "The long tail: headings, buttons, empty states, errors. Lowest stakes individually, and the largest volume — this is the part to skim for anything that sounds wrong rather than to read end to end.",
    source: "packages/config/src/draft-copy.ts → DRAFT_COPY",
    groups: [
      ...Object.entries(DRAFT_COPY).map(([screen, value]) => ({
        title: screen,
        items: walk(value as Record<string, unknown>),
      })),
      {
        title: "Intention labels",
        items: Object.entries(INTENTION_LABELS).map(([id, text]) => ({ text, where: id })),
      },
    ],
  },
];

// ── the page ─────────────────────────────────────────────────────────────────

const count = SECTIONS.reduce(
  (n, s) =>
    n +
    s.groups.reduce(
      (m, g) => m + g.items.reduce((k, item) => k + 1 + (item.under?.length ?? 0), 0),
      0,
    ),
  0,
);

const item = (i: Item) => `
        <li class="specimen">
          ${i.where ? `<p class="where">${esc(i.where)}</p>` : ""}
          <p class="string">${esc(i.text)}</p>
          ${i.under?.length ? `<ul class="under">${i.under.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
          ${i.note ? `<p class="note">${esc(i.note)}</p>` : ""}
        </li>`;

const group = (g: Group) => `
      <section class="group">
        <h3>${esc(g.title)}</h3>
        <ul class="specimens">${g.items.map(item).join("")}</ul>
      </section>`;

const section = (s: Section) => `
  <section class="chapter" id="${s.id}">
    <header class="chapter-head">
      <h2>${esc(s.title)}</h2>
      <p class="stakes">${esc(s.stakes)}</p>
      <p class="source">${esc(s.source)}</p>
    </header>
    ${s.groups.map(group).join("")}
  </section>`;

const html = `<title>Words Nobody Has Approved</title>
<style>
  ${displayFace}
  @font-face { font-family: "Satoshi"; font-weight: 400; font-display: swap; src: ${satoshi(400)}; }
  @font-face { font-family: "Satoshi"; font-weight: 500; font-display: swap; src: ${satoshi(500)}; }
  @font-face { font-family: "Satoshi"; font-weight: 700; font-display: swap; src: ${satoshi(700)}; }

  /* Linen — the app's light theme, verified against WCAG AA in ui-tokens. */
  :root {
    --ground: #f4efe7;
    --surface: #fbf8f3;
    --surface-2: #efe8dc;
    --ink: #1c1917;
    --ink-2: #6b6259;
    --ink-3: #766b60;
    --accent: #9f5b41;
    --line: rgba(28, 25, 23, 0.13);
    --line-2: rgba(28, 25, 23, 0.07);
    --display: ${displayStack};
    --body: "Satoshi", ui-sans-serif, system-ui, sans-serif;
  }
  /* Dusk. Guarded so an explicit light choice beats a dark OS. */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #14110f;
      --surface: #1b1714;
      --surface-2: #241e1a;
      --ink: #ede7de;
      --ink-2: #a79c90;
      --ink-3: #8d8074;
      --accent: #d69a4e;
      --line: rgba(237, 231, 222, 0.12);
      --line-2: rgba(237, 231, 222, 0.06);
    }
  }
  :root[data-theme="dark"] {
    --ground: #14110f;
    --surface: #1b1714;
    --surface-2: #241e1a;
    --ink: #ede7de;
    --ink-2: #a79c90;
    --ink-3: #8d8074;
    --accent: #d69a4e;
    --line: rgba(237, 231, 222, 0.12);
    --line-2: rgba(237, 231, 222, 0.06);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--body);
    font-size: 17px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 4rem 1.5rem 8rem;
    display: grid;
    gap: 4rem;
  }
  @media (min-width: 900px) {
    .page { grid-template-columns: 15rem 1fr; column-gap: 4rem; align-items: start; }
    .masthead, .chapters { grid-column: 2; }
    .index { grid-column: 1; grid-row: 1 / span 2; position: sticky; top: 4rem; }
  }

  /* ── masthead ── */
  .masthead { display: grid; gap: 1.25rem; }
  .wordmark {
    font-family: var(--display);
    font-size: 1.75rem;
    line-height: 1;
    color: var(--ink-2);
  }
  .wordmark sup { font-size: 0.62em; vertical-align: 0.5em; }
  h1 {
    font-family: var(--display);
    font-weight: 400;
    font-size: clamp(2.6rem, 7vw, 4rem);
    line-height: 1.02;
    letter-spacing: -0.015em;
    text-wrap: balance;
    margin: 0;
  }
  .standfirst {
    max-width: 34em;
    margin: 0;
    color: var(--ink-2);
    font-size: 1.0625rem;
  }
  .standfirst + .standfirst { margin-top: -0.5rem; }
  .tally {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
    font-size: 0.8125rem;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  /* ── index ── */
  .index h2 {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.13em;
    color: var(--ink-3);
    font-weight: 500;
    margin: 0 0 0.85rem;
  }
  .index ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.1rem; }
  .index a {
    display: block;
    padding: 0.3rem 0;
    color: var(--ink-2);
    text-decoration: none;
    font-size: 0.9375rem;
    border-bottom: 1px solid transparent;
    transition: color 160ms ease;
  }
  .index a:hover, .index a:focus-visible { color: var(--accent); }

  /* ── chapters ── */
  .chapters { display: grid; gap: 5rem; }
  .chapter { display: grid; gap: 2.25rem; scroll-margin-top: 2rem; }
  .chapter-head { display: grid; gap: 0.75rem; }
  .chapter-head h2 {
    font-family: var(--display);
    font-weight: 400;
    font-size: clamp(1.9rem, 4vw, 2.5rem);
    line-height: 1.1;
    margin: 0;
    text-wrap: balance;
  }
  .stakes { margin: 0; max-width: 44em; color: var(--ink-2); font-size: 0.9375rem; }
  .source {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ink-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-word;
  }

  .group { display: grid; gap: 1rem; }
  .group h3 {
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.13em;
    color: var(--ink-3);
    padding-bottom: 0.65rem;
    border-bottom: 1px solid var(--line);
  }

  .specimens { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.5rem; }
  .specimen { display: grid; gap: 0.4rem; }
  .where {
    margin: 0;
    font-size: 0.6875rem;
    letter-spacing: 0.05em;
    color: var(--ink-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  /* The string itself is the thing being judged, so it carries the weight and
     everything around it recedes. The rule is the quotation mark. */
  .string {
    margin: 0;
    max-width: 40em;
    padding-left: 1rem;
    border-left: 2px solid var(--line);
    color: var(--ink);
    font-size: 1.0625rem;
    line-height: 1.55;
  }
  .under {
    list-style: none;
    margin: 0.15rem 0 0;
    padding: 0 0 0 1rem;
    border-left: 2px solid var(--line-2);
    display: grid;
    gap: 0.2rem;
    max-width: 40em;
  }
  .under li { color: var(--ink-2); font-size: 0.96875rem; }
  .note { margin: 0.1rem 0 0 1rem; max-width: 40em; font-size: 0.8125rem; color: var(--ink-3); }

  .colophon {
    grid-column: 1 / -1;
    border-top: 1px solid var(--line);
    padding-top: 1.5rem;
    max-width: 40em;
    font-size: 0.875rem;
    color: var(--ink-2);
  }
  .colophon strong { color: var(--ink); font-weight: 500; }

  a:focus-visible, :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="page">
  <header class="masthead">
    <p class="wordmark"><sup>+</sup>One</p>
    <h1>Words nobody has approved</h1>
    <p class="standfirst">
      Every user-facing string in Plus One that Claude wrote rather than took from
      the spec. Read for voice, not for accuracy — the factual claims are held to
      the product by tests; the way they sound is held to nothing.
    </p>
    <p class="standfirst">
      Ordered by how much damage the wrong words do. Anything spec-verbatim is
      deliberately absent: §3.4, §3.5 and §9.1 are locked, and a review document
      that included them would invite the one edit the rule forbids.
    </p>
    <p class="tally">
      <span>${count} strings</span>
      <span>${SECTIONS.length} sections</span>
      <span>Generated from the source, ${new Date().toISOString().slice(0, 10)}</span>
    </p>
  </header>

  <nav class="index" aria-label="Sections">
    <h2>In order of stakes</h2>
    <ol>
      ${SECTIONS.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join("\n      ")}
    </ol>
  </nav>

  <div class="chapters">
    ${SECTIONS.map(section).join("\n")}
  </div>

  <footer class="colophon">
    <p>
      <strong>How to mark something.</strong> Comment on any paragraph on this page
      and mention <strong>@claude</strong> in the thread — that hands it to me with
      the string attached, and I will change it and say what I changed. Rewriting a
      line yourself in the comment is the fastest version of that.
    </p>
    <p>
      Regenerate with <code>pnpm copy:review</code>. It reads the config package
      directly, so it can never fall behind the build.
    </p>
  </footer>
</div>
`;

const out = process.argv[2] ?? join(ROOT, "copy-review.html");
writeFileSync(out, html);
console.log(`${count} strings across ${SECTIONS.length} sections → ${out}`);
if (unrendered.length) {
  console.log(`could not render a sample for: ${unrendered.join(", ")}`);
  process.exitCode = 1;
}
