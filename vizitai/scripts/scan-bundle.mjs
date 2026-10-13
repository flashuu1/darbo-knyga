import { readdirSync, readFileSync } from 'node:fs';
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
console.log('bundle scan clean');
