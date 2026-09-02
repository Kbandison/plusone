#!/usr/bin/env node
/**
 * The app icon, generated rather than drawn.
 *
 * PLACEHOLDER. This is Claude's geometry, not Kevin's design — the same status
 * as every unreviewed string in draft-copy.ts. It exists because a PWA without
 * icons cannot be installed and a native shell cannot be built, not because it
 * is the right mark. Replacing it means replacing the SVG below and re-running
 * this; nothing else references the shapes.
 *
 * The plus is the distinctive half of the wordmark and the half that survives
 * being 48 pixels wide. "⁺One" set in Instrument Serif does not — at a home
 * screen size the "One" closes up into a smudge, which is the failure mode of
 * every wordmark-as-icon.
 *
 * Usage:  node scripts/generate-icons.mjs
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/public/icons");
mkdirSync(OUT, { recursive: true });

/** Dusk's ground and accent — see packages/ui-tokens/tokens.css. */
const GROUND = "#14110f";
const ACCENT = "#d69a4e";
/** Dusk's ink, for the one — the plus is the only accent-coloured part. */
const INK = "#ede7de";

/**
 * @param size    pixels
 * @param maskable Android crops a maskable icon to whatever shape the launcher
 *   uses, guaranteeing only the centre 80% circle survives. So the mark is
 *   drawn smaller and the ground fills the whole square — the alternative is an
 *   icon whose arms are sliced off on every Pixel.
 */
/**
 * The status-bar badge, which is NOT a small version of the icon.
 *
 * Android draws it from the ALPHA CHANNEL only — every opaque pixel becomes
 * solid white (or whatever the system tint is) and every transparent one
 * disappears. A badge with an opaque background is therefore a solid white
 * square in the status bar, which is exactly what shipped: the mark was
 * invisible until the shade was pulled down and the full-colour icon appeared.
 *
 * So this draws the glyph and nothing else. The colour is irrelevant — only
 * where the pixels are.
 */
/**
 * The notification small icon: the app's mark, redrawn for 24dp.
 *
 * ── it used to be a bare plus, and that was a leftover ──────────────────────
 *
 * This drew two rectangles crossing, because the mark WAS a plus. It became
 * "⁺1" on 2026-08-28 and the badge did not follow, so every Android status bar
 * carried the retired logo — and no amount of rebuilding fixed it, because the
 * file was doing exactly what it said.
 *
 * ── it is NOT the app icon shrunk, and that was tried ───────────────────────
 *
 * Android renders this at 24dp and tints it flat, so the alpha channel is the
 * whole design. Reusing markGroup at that size fails in both directions and
 * there is no setting between them: at the app icon's weight the plus is under
 * a pixel and disappears, leaving what reads as a bare "1"; thick enough to
 * survive, its arms merge into a rounded blob. Rendered both and looked.
 *
 * So the small size gets its own drawing — the plus set BESIDE the one rather
 * than raised above it, both at a weight that survives. Optical sizing rather
 * than inconsistency: the same two marks, arranged to be legible a quarter of
 * an inch tall.
 */
function badgeSvg(size) {
  // The plus: a cross of two bars, generous enough to read at 24px.
  const arm = size * 0.32;
  const bar = size * 0.092;
  const px = size * 0.25;
  const py = size * 0.44;
  const r = bar / 2;

  // The one: cap height a little over half the canvas, set to its right.
  const cap = size * 0.76;
  const scale = cap / ONE_UPM;
  const cx = (ONE_BBOX.x0 + ONE_BBOX.x1) / 2;
  const cy = (ONE_BBOX.y0 + ONE_BBOX.y1) / 2;
  const ox = size * 0.66;
  const oy = size * 0.55;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g fill="#ffffff">
    <rect x="${(px - arm / 2).toFixed(2)}" y="${(py - bar / 2).toFixed(2)}" width="${arm.toFixed(2)}" height="${bar.toFixed(2)}" rx="${r.toFixed(2)}"/>
    <rect x="${(px - bar / 2).toFixed(2)}" y="${(py - arm / 2).toFixed(2)}" width="${bar.toFixed(2)}" height="${arm.toFixed(2)}" rx="${r.toFixed(2)}"/>
    <path d="${ONE_PATH}"
      transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)}) translate(${-cx} ${-cy})"/>
  </g>
</svg>`);
}

/**
 * The numeral one, as an outline rather than as text.
 *
 * Lifted from Instrument Serif — the face the wordmark is set in, so the icon
 * and the logo are visibly the same family — with fontTools, and pasted here as
 * path data on purpose. An SVG `<text>` element would make this icon depend on
 * a font being installed on whoever runs the script: sharp rasterises through
 * librsvg, which resolves families through fontconfig, and Instrument Serif is
 * a webfont that is on nobody's system. It would not fail. It would quietly
 * draw a different "1" on a different machine, which is the worst outcome
 * available for a build artifact.
 *
 * Coordinates are font units: 1000 to the em, y UP from the baseline, bounding
 * box x 5..239 and y 0..735. Regenerate with:
 *   TTFont(InstrumentSerif-Regular.ttf) -> SVGPathPen on glyph "one"
 */
const ONE_PATH =
  "M20 0Q5 0 5 11Q5 22 18 23L57 27Q78 29 85.5 37.0Q93 45 93 66V660Q93 677 83.5 682.5Q74 688 59 686L23 682Q5 681 5 695Q5 706 21 709Q74 718 99.0 726.5Q124 735 136 735Q157 735 157 713V66Q157 45 164.5 37.0Q172 29 193 27L226 23Q239 22 239 11Q239 0 224 0Z";
const ONE_UPM = 1000;
const ONE_BBOX = { x0: 5, y0: 0, x1: 239, y1: 735 };

/**
 * The mark: a one with the plus on its LEADING shoulder — ⁺1, matching the way
 * the wordmark reads ⁺One. An icon and a logo that disagree about the order of
 * their own name is a thing people notice without being able to say why.
 *
 * Proportions are Kevin's, chosen by eye at true launcher sizes on 2026-08-28:
 * mark 0.44, stroke weight 0.14. Both are deliberately thinner and smaller than
 * the bare plus this replaces.
 *
 * @param size   canvas pixels
 * @param mark   how much of the canvas the composition may occupy
 * @param weight plus stroke, as a fraction of its own arm
 */
function markGroup(size, mark, weight, fill) {
  const cap = size * (mark + 0.3); // the "1"'s font size
  const scale = cap / ONE_UPM;
  const arm = size * mark * 0.42;
  const thickness = arm * weight * 1.5;
  const radius = thickness / 2;

  // Where each piece sits before the whole thing is centred.
  const plusX = size * 0.3;
  const plusY = size * 0.3;
  const oneX = size * 0.56;
  const oneY = size / 2;

  /**
   * Centre the COMPOSITION, not the "1".
   *
   * Placing the one at 0.56 and the plus at 0.30 leaves the right third of the
   * square empty, which reads as a mark that has slipped left — invisible in a
   * comparison strip and obvious on a home screen next to other icons. So the
   * combined bounding box is measured and the whole group nudged to centre it.
   */
  const oneHalfW = ((ONE_BBOX.x1 - ONE_BBOX.x0) * scale) / 2;
  const left = Math.min(plusX - arm / 2, oneX - oneHalfW);
  const right = Math.max(plusX + arm / 2, oneX + oneHalfW);
  const dx = size / 2 - (left + right) / 2;

  // Font units are y-up; SVG is y-down, hence the negative scale.
  const cx = (ONE_BBOX.x0 + ONE_BBOX.x1) / 2;
  const cy = (ONE_BBOX.y0 + ONE_BBOX.y1) / 2;

  return `<g transform="translate(${dx.toFixed(2)} 0)">
    <path d="${ONE_PATH}" fill="${fill ?? INK}"
      transform="translate(${oneX.toFixed(2)} ${oneY.toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)}) translate(${-cx} ${-cy})"/>
    <g fill="${fill ?? ACCENT}">
      <rect x="${(plusX - arm / 2).toFixed(2)}" y="${(plusY - thickness / 2).toFixed(2)}" width="${arm.toFixed(2)}" height="${thickness.toFixed(2)}" rx="${radius.toFixed(2)}"/>
      <rect x="${(plusX - thickness / 2).toFixed(2)}" y="${(plusY - arm / 2).toFixed(2)}" width="${thickness.toFixed(2)}" height="${arm.toFixed(2)}" rx="${radius.toFixed(2)}"/>
    </g>
  </g>`;
}

function svg(size, maskable) {
  /**
   * Android crops a maskable icon to the launcher's shape, guaranteeing only
   * the centre 80% circle. The old bare plus used 0.42 where the standard icon
   * used 0.58; this keeps that same ratio against Kevin's 0.44 rather than
   * inventing a second number to maintain.
   */
  const mark = maskable ? 0.44 * (0.42 / 0.58) : 0.44;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${GROUND}"/>
  ${markGroup(size, mark, 0.14)}
</svg>`);
}

/**
 * The same mark on the same ground, drawn small — see the launch-image note at
 * the foot of this file for where 0.11 comes from.
 */
function splashSvg(size) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${GROUND}"/>
  ${markGroup(size, 0.11, 0.14)}
</svg>`);
}

// 192 and 512 are what the manifest spec asks for; 180 is the size iOS reads
// from apple-touch-icon and it does NOT scale the others.
const JOBS = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-192.png", 192, true],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
];

for (const [name, size, maskable] of JOBS) {
  const png = await sharp(svg(size, maskable)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, name), png);
  console.log(`  ${name}  ${size}×${size}${maskable ? " maskable" : ""}  ${png.length} bytes`);
}

// Transparent everywhere but the glyph — see badgeSvg.
{
  const png = await sharp(badgeSvg(96)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, "badge-96.png"), png);
  const { channels, isOpaque } = await sharp(png).stats();
  console.log(
    `  badge-96.png  96×96  alpha-only  ${png.length} bytes  (opaque: ${isOpaque}, channels: ${channels.length})`,
  );
  if (isOpaque) {
    console.error("  badge has no transparency — Android will draw a solid square");
    process.exitCode = 1;
  }
}

// The favicon, which the browser tab reads and which nothing else was serving.
writeFileSync(
  join(OUT, "../favicon.ico"),
  await sharp(svg(64, false)).resize(48, 48).png().toBuffer(),
);
console.log("  favicon.ico  48×48");

/**
 * The iOS shell's icon and launch image.
 *
 * Same mark, same placeholder status — see the header. They are written here
 * rather than dropped into the asset catalogue by hand so that replacing the
 * SVG above replaces every surface at once; an app icon that drifts from the
 * home-screen icon is the failure this avoids, and it is invisible until
 * somebody has both installed.
 *
 * Skipped rather than fatal when the platform is absent: `apps/ios/ios` is
 * generated by `npx cap add ios` and a checkout that has not run it should
 * still be able to regenerate the web icons.
 */
const IOS_ASSETS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/ios/ios/App/App/Assets.xcassets",
);

if (!existsSync(IOS_ASSETS)) {
  console.log("  (no apps/ios/ios — run `npx cap add ios` first; skipping the iOS assets)");
} else {
  /**
   * The app icon, and the one image in this script that may NOT have an alpha
   * channel. App Store Connect rejects a 1024 icon that carries one, even a
   * fully opaque one — the check is for the channel, not for transparency. The
   * SVG paints an opaque ground, so `flatten` only drops the channel sharp
   * would otherwise add.
   *
   * One 1024 is the whole set. Xcode has generated every other size from it
   * since 14, which is why the catalogue has a single `universal` entry.
   */
  const icon = await sharp(svg(1024, false))
    .flatten({ background: GROUND })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const { isOpaque, channels } = await sharp(icon).stats();
  writeFileSync(join(IOS_ASSETS, "AppIcon.appiconset/AppIcon-512@2x.png"), icon);
  console.log(
    `  AppIcon-512@2x.png  1024×1024  ${icon.length} bytes  (channels: ${channels.length})`,
  );
  if (channels.length > 3 || !isOpaque) {
    console.error("  app icon carries an alpha channel — App Store Connect will reject it");
    process.exitCode = 1;
  }

  /**
   * The launch image, whose mark is far smaller than the icon's and not by eye.
   *
   * The storyboard draws this square image with `scaleAspectFill` into a phone
   * -shaped view, so the left and right of it are cropped away: on a 9:19.5
   * screen only the middle ~46% of the width survives. A mark drawn at the
   * icon's 0.58 of the canvas would be 1585px inside a 1260px window — its arms
   * sliced off, on the first thing anybody sees. 0.11 puts it at roughly the
   * size of the home-screen icon it replaces for that half-second.
   *
   * Three files with identical content, which is what the Capacitor template
   * ships: the catalogue asks for 1x/2x/3x and the image is already larger than
   * any of them needs.
   */
  const splash = await sharp(splashSvg(2732)).png({ compressionLevel: 9 }).toBuffer();
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    writeFileSync(join(IOS_ASSETS, "Splash.imageset", name), splash);
  }
  console.log(`  Splash.imageset  2732×2732 ×3  ${splash.length} bytes each`);
}

/**
 * One icon per KIND of notification, drawn on the same ground as everything
 * else here.
 *
 * ── why these exist ─────────────────────────────────────────────────────────
 *
 * Android draws a large icon on the right of a notification and will not leave
 * it empty: with none it synthesises a monogram from the origin, which is a
 * grey circle with a "W" in it, for "www". That was measured twice — once when
 * the icon was first added, and again on 2026-09-01 when it was removed on the
 * theory that TWA delegation had changed the fallback. It had not.
 *
 * So the slot is going to be filled either way, and the only question is by
 * what. It used to be the app mark, which meant the mark appeared twice in one
 * notification, once each side. Kevin asked for something that pertains to the
 * notification instead, which is the better use of a space that cannot be blank.
 *
 * ── they say nothing the body does not ──────────────────────────────────────
 *
 * §8 governs what a notification DISPLAYS, and a glyph is displayed. Each one
 * is chosen to match the sentence already on screen — a speech bubble beside
 * "You have a new message" tells a passer-by nothing the words did not. None of
 * them is specific to a condition, a person, or a room, and the set is
 * deliberately coarse: six glyphs for seventeen events, so the icon can never
 * narrow what the body says.
 */
const GLYPHS = {
  // A speech bubble. Messages, and anything somebody wrote.
  message: `<path d="M14 22h36a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H30l-11 9v-9h-5a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6Z"
        fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linejoin="round"/>`,

  // An arrow turning back. A connect is a reply to a prompt, never a wave.
  connect: `<path d="M40 20 24 34l16 14" fill="none" stroke="${ACCENT}" stroke-width="5"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M24 34h18a14 14 0 0 1 14 14v8" fill="none" stroke="${ACCENT}" stroke-width="5"
        stroke-linecap="round"/>`,

  // A calendar. A plan is the thing a chat is for.
  plan: `<rect x="14" y="22" width="42" height="38" rx="6" fill="none" stroke="${ACCENT}" stroke-width="5"/>
      <path d="M14 34h42M25 16v10M45 16v10" fill="none" stroke="${ACCENT}" stroke-width="5"
        stroke-linecap="round"/>`,

  // A clock. Everything with a deadline on it.
  time: `<circle cx="35" cy="38" r="21" fill="none" stroke="${ACCENT}" stroke-width="5"/>
      <path d="M35 26v13l9 6" fill="none" stroke="${ACCENT}" stroke-width="5"
        stroke-linecap="round" stroke-linejoin="round"/>`,

  // Two people. Rooms, and anybody arriving near you.
  people: `<circle cx="27" cy="30" r="9" fill="none" stroke="${ACCENT}" stroke-width="5"/>
      <circle cx="47" cy="33" r="7" fill="none" stroke="${ACCENT}" stroke-width="5"/>
      <path d="M13 58c0-8 6-13 14-13s14 5 14 13" fill="none" stroke="${ACCENT}" stroke-width="5"
        stroke-linecap="round"/>
      <path d="M45 58c0-6 4-10 9-10s9 4 9 10" fill="none" stroke="${ACCENT}" stroke-width="5"
        stroke-linecap="round"/>`,
};

/** The glyph on the app's ground, at the size a large icon is drawn. */
function glyphSvg(size, glyph) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 70 70">
  <rect width="70" height="70" rx="16" fill="${GROUND}"/>
  ${glyph}
</svg>`);
}

for (const [name, glyph] of Object.entries(GLYPHS)) {
  const png = await sharp(glyphSvg(192, glyph)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, `n-${name}.png`), png);
  console.log(`  n-${name}.png  192×192  ${png.length} bytes`);
}

/**
 * The Drop keeps the app's own mark, because it IS the app's own moment rather
 * than a kind of thing that happened. Written as its own file rather than
 * pointed at icon-192 so every notification icon is one naming convention.
 */
{
  const png = await sharp(svg(192, false)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, "n-drop.png"), png);
  console.log(`  n-drop.png  192×192  ${png.length} bytes  (the mark)`);
}

/**
 * The same badge, into the Android notification drawables.
 *
 * These were made by hand and were therefore outside the "one generator, every
 * surface" rule the rest of this file follows — which is exactly how they came
 * to be a retired logo that regenerating the web icons never touched. Android
 * draws the small icon at 24dp; the five densities are that at 1x through 4x.
 */
{
  const ANDROID_RES = join(
    dirname(fileURLToPath(import.meta.url)),
    "../apps/android/app/src/main/res",
  );
  const DENSITIES = [
    ["mdpi", 24],
    ["hdpi", 36],
    ["xhdpi", 48],
    ["xxhdpi", 72],
    ["xxxhdpi", 96],
  ];

  for (const [density, px] of DENSITIES) {
    const dir = join(ANDROID_RES, `drawable-${density}`);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const png = await sharp(badgeSvg(px)).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(join(dir, "ic_notification_icon.png"), png);

    // An opaque small icon renders as a solid white block, so the alpha channel
    // is checked rather than assumed — the same guard the web badge gets.
    const { isOpaque } = await sharp(png).stats();
    if (isOpaque) throw new Error(`ic_notification_icon at ${density} has no alpha`);
    console.log(`  ic_notification_icon ${density}  ${px}×${px}  ${png.length} bytes`);
  }
}
