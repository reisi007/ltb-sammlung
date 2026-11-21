#!/usr/bin/env node
/**
 * Erzeugt die PWA-PNGs aus den beiden eigenen SVGs in public/.
 *
 * Die SVGs sind eigenes, einfaches Wortmarken-Design („LTB" auf einfarbigem
 * Grund) und kopieren kein offizielles Logo oder Artwork.
 */
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rounded = resolve(root, "public/icon.svg");
const maskable = resolve(root, "public/icon-maskable.svg");
const outputDir = resolve(root, "public/icons");

const targets = [
  { source: rounded, file: "pwa-192x192.png", size: 192 },
  { source: rounded, file: "pwa-512x512.png", size: 512 },
  { source: maskable, file: "maskable-512x512.png", size: 512 },
  { source: maskable, file: "apple-touch-icon.png", size: 180 },
];

await mkdir(outputDir, { recursive: true });

for (const target of targets) {
  await sharp(target.source, { density: 384 })
    .resize(target.size, target.size)
    .png()
    .toFile(resolve(outputDir, target.file));
  console.info(`${target.file} (${target.size}×${target.size})`);
}
