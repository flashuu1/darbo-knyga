import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${file}`, import.meta.url)));
}
console.log('icons written');
