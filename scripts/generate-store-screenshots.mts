#!/usr/bin/env tsx
/**
 * The Play and App Store screenshots: real captures, with a caption over each.
 *
 * ── why they are captures, and why they are not JUST captures ───────────────
 *
 * Play's guidance is that screenshots "demonstrate the actual in-app
 * experience" and are "captured directly from the real app", and that a tagline
 * takes no more than 20% of the image. The first version of this file rendered
 * six purely typographic panels — no UI at all — which was a rejection risk
 * dressed up as a design decision. It was replaced after Kevin asked the
 * obvious question about it.
 *
 * ── what had to be true before a capture was worth anything ────────────────
 *
 * Two things, both found the hard way on 2026-08-28:
 *
 *   1. Production is empty, so the screens photograph as empty states. Fixed by
 *      seeding — `pnpm seed` with SEED_NEAR, plus seed:talk and seed:rooms.
 *   2. The seeds could not match the member they were seeded for, because
 *      `gender` and `seeking` cycled in lockstep. Browse and the Drop came back
 *      empty while the filter worked perfectly. Fixed in seed-test-members.mjs.
 *
 * And the constraint that rules out the obvious shortcut: the screens that are
 * NOT empty in a real account show real members of an app for people with HIV
 * and HSV, and those cannot go on a public store page at any quality setting.
 * Seeded members are the only honest source.
 *
 * ── the captures ───────────────────────────────────────────────────────────
 *
 * `captures/` holds PNGs taken off a real device with
 * `adb exec-out screencap -p`. They are committed because they are INPUTS: this
 * script cannot reproduce them, and a listing asset that can only be rebuilt
 * with a phone in your hand needs its source in the repository.
 *
 * Usage:  pnpm screenshots
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { COPY, FUSE } from "@plusone/config";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../apps/android/store-screenshots");
const CAPTURES = join(OUT, "captures");
mkdirSync(OUT, { recursive: true });

/**
 * 1080×1920, and the size is not a preference.
 *
 * Play requires an aspect ratio between 16:9 and 9:16 inclusive. The device
 * these were taken on is 1440×3120 — 9:19.5, TALLER than the limit — so an
 * unedited capture from it is rejected before anybody looks at it.
 */
const WIDTH = 1080;
const HEIGHT = 1920;

/** The caption band. 240px is 12.5% of the height — inside Play's 20% cap. */
const CAPTION_H = 240;

/** Dusk, from packages/ui-tokens/tokens.css. */
const T = { ground: "#14110f", ink: "#ede7de", ink2: "#a79c90", accent: "#d69a4e" };

const b64 = (p: string) => readFileSync(p).toString("base64");

const FONTS = {
  instrument: b64(join(HERE, "assets/InstrumentSerif-Regular.ttf")),
  satoshi400: b64(join(HERE, "../apps/web/src/app/fonts/satoshi-400.woff2")),
};

interface Shot {
  readonly file: string;
  readonly capture: string;
  /** Short. It sits above the picture and Play counts it against the 20%. */
  readonly caption: string;
  readonly sub?: string;
}

const SHOTS: readonly Shot[] = [
  {
    file: "01-verified.png",
    capture: "browse.png",
    caption: "Everyone here is verified",
    sub: COPY.marketing.sub,
  },
  {
    file: "02-inbox.png",
    capture: "inbox.png",
    caption: "Nobody gets left on read",
    sub: `Every chat has ${FUSE.windowHours / 24} days to turn into a plan.`,
  },
  {
    file: "03-chat.png",
    capture: "chat.png",
    caption: "Chats that end kindly",
    sub: "If it does not become a plan, it closes — for both of you.",
  },
  {
    file: "04-rooms.png",
    capture: "room.png",
    caption: "Support, not only dating",
    sub: "Rooms are for community. Nobody has to be looking for anything.",
  },
  {
    file: "05-news.png",
    capture: "news.png",
    caption: "What is actually known",
    sub: "Published elsewhere, gathered here.",
  },
];

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function html(shot: Shot, capture: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: "Instrument Serif"; src: url(data:font/ttf;base64,${FONTS.instrument}) format("truetype"); font-weight: 400; font-display: block; }
  @font-face { font-family: "Satoshi"; src: url(data:font/woff2;base64,${FONTS.satoshi400}) format("woff2"); font-weight: 400; font-display: block; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body { background: ${T.ground}; font-family: "Satoshi", sans-serif; }

  .caption {
    height: ${CAPTION_H}px;
    display: flex; flex-direction: column; justify-content: center; gap: 14px;
    padding: 0 64px; text-align: center; align-items: center;
  }
  h1 {
    font-family: "Instrument Serif", serif; font-weight: 400;
    font-size: 62px; line-height: 1.05; letter-spacing: -0.02em;
    color: ${T.ink}; text-wrap: balance;
  }
  p { font-size: 26px; line-height: 1.4; color: ${T.ink2}; max-width: 860px; }

  /*
   * The capture, full width and cropped from the top.
   *
   * Scaled to the canvas width, then clipped to whatever height is left. That
   * keeps the app header and the top of the content — which is where the thing
   * worth showing is — and loses the bottom of a screen that is mostly empty on
   * a 9:19.5 phone anyway. The device status bar is cropped off first (155px of the 1440-wide capture, measured rather than guessed — 90 left a visible sliver) so
   * the shot reads as the app rather than as somebody's phone.
   */
  .shot { position: relative; height: ${HEIGHT - CAPTION_H}px; overflow: hidden; }
  .shot img { position: absolute; top: -${Math.round(155 * (WIDTH / 1440))}px; left: 0; width: ${WIDTH}px; display: block; }
</style></head><body>
  <div class="caption">
    <h1>${escape(shot.caption)}</h1>
    ${shot.sub ? `<p>${escape(shot.sub)}</p>` : ""}
  </div>
  <div class="shot"><img src="data:image/png;base64,${capture}" alt=""></div>
</body></html>`;
}

for (const shot of SHOTS) {
  if (!existsSync(join(CAPTURES, shot.capture))) {
    throw new Error(`missing capture: captures/${shot.capture}`);
  }
  for (const s of [shot.caption, shot.sub ?? ""]) {
    if (/\b(undefined|null|NaN)\b/.test(s)) throw new Error(`${shot.file}: copy hole — "${s}"`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});

for (const shot of SHOTS) {
  await page.setContent(html(shot, b64(join(CAPTURES, shot.capture))), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png" });
  writeFileSync(join(OUT, shot.file), png);
  console.log(`  ${shot.file}  ${WIDTH}×${HEIGHT}  ${png.length} bytes  (${shot.capture})`);
}

/**
 * The feature graphic — 1024×500, and Play will not publish a listing without
 * one. Not a screenshot: Play crops it and on some surfaces draws the app title
 * across it, so it keeps to the wordmark and one line, well inside the edges.
 */
const FEATURE = { width: 1024, height: 500 };
await page.setViewportSize(FEATURE);
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: "Instrument Serif"; src: url(data:font/ttf;base64,${FONTS.instrument}) format("truetype"); font-weight: 400; font-display: block; }
    @font-face { font-family: "Satoshi"; src: url(data:font/woff2;base64,${FONTS.satoshi400}) format("woff2"); font-weight: 400; font-display: block; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${FEATURE.width}px; height: ${FEATURE.height}px; }
    body { background: ${T.ground}; color: ${T.ink}; font-family: "Satoshi", sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 26px; text-align: center; padding: 0 140px; }
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
  `\n  ${SHOTS.length} screenshots + the feature graphic in apps/android/store-screenshots/`,
);
console.log(
  `  Caption band is ${CAPTION_H}px of ${HEIGHT} — ${Math.round((CAPTION_H / HEIGHT) * 100)}%, inside Play's 20% cap.`,
);
