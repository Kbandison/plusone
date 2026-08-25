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
function badgeSvg(size) {
  const arm = size * 0.62;
  const thickness = arm * 0.26;
  const c = size / 2;
  const radius = thickness / 2;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g fill="#ffffff">
    <rect x="${c - arm / 2}" y="${c - thickness / 2}" width="${arm}" height="${thickness}" rx="${radius}"/>
    <rect x="${c - thickness / 2}" y="${c - arm / 2}" width="${thickness}" height="${arm}" rx="${radius}"/>
  </g>
</svg>`);
}

function svg(size, maskable) {
  // The safe fraction of the width the mark may occupy.
  const scale = maskable ? 0.42 : 0.58;
  const arm = size * scale;
  const thickness = arm * 0.26;
  const c = size / 2;
  const radius = thickness / 2;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${GROUND}"/>
  <g fill="${ACCENT}">
    <rect x="${c - arm / 2}" y="${c - thickness / 2}" width="${arm}" height="${thickness}" rx="${radius}"/>
    <rect x="${c - thickness / 2}" y="${c - arm / 2}" width="${thickness}" height="${arm}" rx="${radius}"/>
  </g>
</svg>`);
}

/**
 * The same mark on the same ground, drawn small — see the launch-image note at
 * the foot of this file for where 0.11 comes from.
 */
function splashSvg(size) {
  const arm = size * 0.11;
  const thickness = arm * 0.26;
  const c = size / 2;
  const radius = thickness / 2;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${GROUND}"/>
  <g fill="${ACCENT}">
    <rect x="${c - arm / 2}" y="${c - thickness / 2}" width="${arm}" height="${thickness}" rx="${radius}"/>
    <rect x="${c - thickness / 2}" y="${c - arm / 2}" width="${thickness}" height="${arm}" rx="${radius}"/>
  </g>
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
