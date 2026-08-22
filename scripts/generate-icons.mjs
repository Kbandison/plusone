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

import { mkdirSync, writeFileSync } from "node:fs";
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

// 192 and 512 are what the manifest spec asks for; 180 is the size iOS reads
// from apple-touch-icon and it does NOT scale the others.
const JOBS = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-192.png", 192, true],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
  // The badge is monochrome and Android tints it, so only the alpha matters.
  ["badge-96.png", 96, true],
];

for (const [name, size, maskable] of JOBS) {
  const png = await sharp(svg(size, maskable)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, name), png);
  console.log(`  ${name}  ${size}×${size}${maskable ? " maskable" : ""}  ${png.length} bytes`);
}

// The favicon, which the browser tab reads and which nothing else was serving.
writeFileSync(
  join(OUT, "../favicon.ico"),
  await sharp(svg(64, false)).resize(48, 48).png().toBuffer(),
);
console.log("  favicon.ico  48×48");
