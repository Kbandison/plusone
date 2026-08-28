#!/usr/bin/env tsx
/**
 * The Play and App Store screenshots, generated rather than captured.
 *
 * Raw device captures are the obvious approach and they do not work here, for
 * two reasons found the hard way on 2026-08-28:
 *
 *   1. The production database is nearly empty, so every screen photographs as
 *      an empty state — "Nothing tonight" is honest and it is not a listing.
 *   2. The screens that are NOT empty show real members of an app for people
 *      with HIV and HSV. Those cannot go on a public store page at any quality
 *      setting, and inventing photorealistic fake members to stand in for them
 *      is its own problem.
 *
 * So these are composed: the app's real chrome, its real palette and typefaces,
 * and its real copy — imported from @plusone/config rather than retyped, so a
 * listing cannot drift from the product the way a hand-written one would. No
 * invented people appear anywhere.
 *
 * Usage:  pnpm screenshots
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { COPY, FUSE, HOW_IT_WORKS } from "@plusone/config";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../apps/android/store-screenshots");
mkdirSync(OUT, { recursive: true });

/**
 * 1080×1920, and the size is not a preference.
 *
 * Play requires an aspect ratio between 16:9 and 9:16 inclusive. Kevin's own
 * phone is 1440×3120, which is 9:19.5 — TALLER than the limit — so a real
 * device capture from it is rejected before anybody looks at it. 9:16 is the
 * tallest shape the store accepts.
 */
const WIDTH = 1080;
const HEIGHT = 1920;

/** Dusk, from packages/ui-tokens/tokens.css. The app's dark palette. */
const T = {
  ground: "#14110f",
  surface: "#1b1714",
  surface2: "#241e1a",
  ink: "#ede7de",
  ink2: "#a79c90",
  ink3: "#8d8074",
  accent: "#d69a4e",
  line: "rgba(237, 231, 222, 0.12)",
};

const font = (p: string) => readFileSync(join(HERE, p)).toString("base64");

/**
 * Embedded rather than linked, so a render is identical on any machine.
 *
 * The same trap the icon generator hit: a font referenced by family name is
 * resolved through the host's fontconfig, and both of these are webfonts that
 * are on nobody's system. It would not fail — it would quietly render in
 * something else.
 */
const FONTS = {
  instrument: font("assets/InstrumentSerif-Regular.ttf"),
  satoshi400: font("../apps/web/src/app/fonts/satoshi-400.woff2"),
  satoshi500: font("../apps/web/src/app/fonts/satoshi-500.woff2"),
};

interface Panel {
  readonly file: string;
  /** Which bottom-nav tab reads as current. */
  readonly tab: string;
  readonly eyebrow: string;
  readonly headline: string;
  readonly body: readonly string[];
  /** The app's own words, set apart the way the app sets them apart. */
  readonly quote?: string;
}

/**
 * Six panels, and every string in them comes from the product.
 *
 * The order is the order somebody experiences the app, which is also the order
 * `HOW_IT_WORKS` uses — verify, the Drop, the fuse — with the identity panel
 * first because it is the one a store shows as the thumbnail.
 */
const PANELS: readonly Panel[] = [
  {
    file: "01-what-it-is.png",
    tab: "Tonight",
    eyebrow: "Plus One",
    headline: COPY.marketing.hero,
    body: [COPY.marketing.sub],
  },
  {
    file: "02-everyone-verifies.png",
    tab: "Tonight",
    eyebrow: "Step one",
    headline: HOW_IT_WORKS[0]!.title,
    body: HOW_IT_WORKS[0]!.body,
    quote: COPY.marketing.verificationPitch,
  },
  {
    file: "03-three-a-night.png",
    tab: "Tonight",
    eyebrow: "Tonight's Drop",
    headline: HOW_IT_WORKS[1]!.title,
    body: HOW_IT_WORKS[1]!.body.slice(0, 2),
  },
  {
    file: "04-ends-kindly.png",
    tab: "Inbox",
    eyebrow: `Every chat, ${FUSE.windowHours / 24} days`,
    headline: "Nobody gets left on read",
    body: [COPY.fuse.explainer],
  },
  {
    file: "05-privacy.png",
    tab: "Profile",
    eyebrow: "Privacy",
    headline: "Structural, not promised",
    body: [
      "Your location is rounded before it is ever stored, so the exact position never reaches our database at all.",
      "There is no analytics or advertising SDK in this app. Nothing is sold or shared with data brokers.",
      "You can delete everything, permanently, from Settings.",
    ],
  },
  {
    file: "06-support.png",
    tab: "Rooms",
    eyebrow: "Rooms",
    headline: "Support, not only dating",
    body: [
      "Rooms are for people who want community rather than a date. Nobody has to be looking for anything to belong here.",
      COPY.uEqualsU.explainer,
    ],
  },
];

const NAV = ["Tonight", "Browse", "Inbox", "Rooms", "Profile"];

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function html(panel: Panel): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: "Instrument Serif"; src: url(data:font/ttf;base64,${FONTS.instrument}) format("truetype"); font-weight: 400; font-display: block; }
  @font-face { font-family: "Satoshi"; src: url(data:font/woff2;base64,${FONTS.satoshi400}) format("woff2"); font-weight: 400; font-display: block; }
  @font-face { font-family: "Satoshi"; src: url(data:font/woff2;base64,${FONTS.satoshi500}) format("woff2"); font-weight: 500; font-display: block; }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    background: ${T.ground};
    color: ${T.ink};
    font-family: "Satoshi", sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column;
  }

  /* The app's own header, at this canvas's scale. */
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 74px 64px 0;
  }
  .wordmark {
    font-family: "Instrument Serif", serif;
    font-size: 62px; line-height: 1; letter-spacing: -0.02em;
  }
  /* Exactly what ui.tsx renders — 0.90em, raised 0.30em, accent. */
  .wordmark .plus { font-size: 0.90em; vertical-align: 0.30em; color: ${T.accent}; }
  .glyphs { display: flex; gap: 40px; opacity: 0.75; }
  .glyphs svg { width: 46px; height: 46px; stroke: ${T.ink2}; fill: none; stroke-width: 1.6; }

  /* Centred between the header and the nav rather than hung from the top.
     These panels carry between one and three paragraphs, so a fixed top
     padding leaves the short ones with a third of the frame empty. */
  main {
    flex: 1;
    padding: 0 64px;
    display: flex; flex-direction: column; justify-content: center; gap: 44px;
  }
  .eyebrow {
    font-size: 26px; letter-spacing: 0.14em; text-transform: uppercase;
    color: ${T.accent};
  }
  h1 {
    font-family: "Instrument Serif", serif;
    font-weight: 400; font-size: 104px; line-height: 1.03;
    letter-spacing: -0.022em; text-wrap: balance;
  }
  .body { display: flex; flex-direction: column; gap: 30px; max-width: 880px; }
  .body p { font-size: 34px; line-height: 1.5; color: ${T.ink2}; }

  /* The quoted line, set the way the app sets one: a rule, not a box. */
  blockquote {
    border-left: 4px solid ${T.accent};
    padding-left: 34px;
    font-size: 34px; line-height: 1.45; color: ${T.ink};
    max-width: 880px;
  }

  nav {
    display: flex; justify-content: space-between;
    padding: 40px 64px 74px;
    border-top: 1px solid ${T.line};
    font-size: 27px; color: ${T.ink3};
  }
  nav .tab { position: relative; padding-bottom: 16px; }
  nav .tab.on { color: ${T.ink}; }
  nav .tab.on::after {
    content: ""; position: absolute; left: 50%; transform: translateX(-50%);
    bottom: 0; width: 46px; height: 3px; background: ${T.accent};
  }
</style></head>
<body>
  <header>
    <span class="wordmark"><span class="plus">+</span>One</span>
    <span class="glyphs">
      <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
    </span>
  </header>

  <main>
    <p class="eyebrow">${escape(panel.eyebrow)}</p>
    <h1>${escape(panel.headline)}</h1>
    <div class="body">${panel.body.map((p) => `<p>${escape(p)}</p>`).join("")}</div>
    ${panel.quote ? `<blockquote>${escape(panel.quote)}</blockquote>` : ""}
  </main>

  <nav>${NAV.map((t) => `<span class="tab${t === panel.tab ? " on" : ""}">${t}</span>`).join("")}</nav>
</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});

/**
 * Nothing reaches a store listing with a hole in it.
 *
 * These strings are interpolated from @plusone/config, so a renamed constant
 * produces "undefined" rather than an error — the first run of this shipped an
 * eyebrow reading "Every chat, undefined days", and it was caught by looking at
 * the picture rather than by anything mechanical. A listing is public and
 * permanent enough to deserve a check.
 */
for (const panel of PANELS) {
  const strings = [panel.eyebrow, panel.headline, ...panel.body, panel.quote ?? ""];
  for (const s of strings) {
    if (/\b(undefined|null|NaN)\b/.test(s)) {
      throw new Error(`${panel.file}: copy contains a hole — "${s}"`);
    }
    if (!s.trim() && s !== "") throw new Error(`${panel.file}: blank string`);
  }
}

for (const panel of PANELS) {
  await page.setContent(html(panel), { waitUntil: "load" });
  // Without this the first render can land before the embedded faces are
  // ready, and the panel is set in a fallback — the exact failure the data
  // URIs exist to prevent.
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ type: "png" });
  writeFileSync(join(OUT, panel.file), shot);
  console.log(`  ${panel.file}  ${WIDTH}×${HEIGHT}  ${shot.length} bytes`);
}

/**
 * The feature graphic — 1024×500, and Play will not publish a listing without
 * one.
 *
 * It is NOT a screenshot and should not be treated as one: Play crops and
 * overlays it, and on some surfaces draws the app title across it, so anything
 * important must stay away from the edges and there is no point putting body
 * copy in it. Wordmark and one line.
 */
const FEATURE = { width: 1024, height: 500 };

await page.setViewportSize(FEATURE);
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: "Instrument Serif"; src: url(data:font/ttf;base64,${FONTS.instrument}) format("truetype"); font-weight: 400; font-display: block; }
    @font-face { font-family: "Satoshi"; src: url(data:font/woff2;base64,${FONTS.satoshi400}) format("woff2"); font-weight: 400; font-display: block; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${FEATURE.width}px; height: ${FEATURE.height}px; }
    body {
      background: ${T.ground}; color: ${T.ink};
      font-family: "Satoshi", sans-serif; -webkit-font-smoothing: antialiased;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 26px; text-align: center;
      /* Play overlays and crops the edges; keep everything well inside. */
      padding: 0 140px;
    }
    .wordmark { font-family: "Instrument Serif", serif; font-size: 96px; line-height: 1; letter-spacing: -0.02em; }
    .wordmark .plus { font-size: 0.90em; vertical-align: 0.30em; color: ${T.accent}; }
    p { font-size: 30px; line-height: 1.4; color: ${T.ink2}; max-width: 700px; }
  </style></head><body>
    <span class="wordmark"><span class="plus">+</span>One</span>
    <p>${escape(COPY.marketing.hero)}</p>
  </body></html>`,
  { waitUntil: "load" },
);
await page.evaluate(() => document.fonts.ready);
const feature = await page.screenshot({ type: "png" });
writeFileSync(join(OUT, "feature-graphic.png"), feature);
console.log(`  feature-graphic.png  ${FEATURE.width}×${FEATURE.height}  ${feature.length} bytes`);

await browser.close();
console.log(
  `\n  ${PANELS.length} screenshots + the feature graphic in apps/android/store-screenshots/`,
);
console.log("  Play accepts 2–8 per listing; the same set works for App Store Connect.");
