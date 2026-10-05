// Renders the PWA icon set from the SVG sources. Run: node scripts/icons.mjs
import sharp from "sharp";
const out = [
  ["public/icons/icon.svg", "public/icons/icon-192.png", 192],
  ["public/icons/icon.svg", "public/icons/icon-512.png", 512],
  ["public/icons/maskable.svg", "public/icons/maskable-512.png", 512],
  ["public/icons/maskable.svg", "public/icons/apple-touch-icon.png", 180],
  ["public/icons/icon.svg", "public/icons/badge-96.png", 96],
];
for (const [src, dest, size] of out) await sharp(src).resize(size, size).png().toFile(dest);
console.log("icons written");
