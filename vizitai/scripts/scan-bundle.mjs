import { readdirSync, readFileSync } from 'node:fs';
import { checkBase, normalizeBase } from './base-check.mjs';
const dir = new URL('../dist/assets/', import.meta.url);
const banned = ['Cancel', 'Save', 'Today', 'Settings', 'Search', 'Undo', 'Delete', 'Close', 'Calendar', 'Clients', 'Appointment', 'Loading']; // 'Error' omitted: Dexie bundles an English "Error" literal; app code is covered by the no-literals test
let bad = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  for (const w of banned) if (new RegExp(`["'\`]${w}["'\`]`).test(src)) bad.push(`${f}: "${w}"`);
}
if (bad.length) { console.error('English UI strings in bundle:\n' + bad.join('\n')); process.exit(1); }

// Precache: every icon present, no URL listed twice.
const sw = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
const urls = [...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]);
const dupes = [...new Set(urls.filter((u, i) => urls.indexOf(u) !== i))];
const missing = ['index.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon.svg', 'icon-192.png', 'icon-512.png'].filter((u) => !urls.includes(u));
if (dupes.length || missing.length) { console.error(`Precache problem. Duplicates: ${dupes.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}`); process.exit(1); }

// Base path: dist/ must have been built for the production base (same rule as vite.config.ts).
const site = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const base = normalizeBase(process.env.VIZITAI_BASE || site.basePath);
const baseProblems = checkBase({
  base,
  html: readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8'),
  manifest: JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8')),
  precacheUrls: urls,
});
if (baseProblems.length) { console.error(`dist/ is inconsistent with base ${base} (built with --mode e2e or another VIZITAI_BASE?):\n${baseProblems.join('\n')}`); process.exit(1); }
console.log(`bundle scan clean (base ${base})`);
