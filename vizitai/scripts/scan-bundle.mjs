import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../dist/assets/', import.meta.url);
const banned = ['Cancel', 'Save', 'Today', 'Settings', 'Search', 'Undo', 'Delete', 'Close', 'Calendar', 'Clients', 'Appointment', 'Loading']; // 'Error' omitted: Dexie bundles an English "Error" literal; app code is covered by the no-literals test
let bad = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  for (const w of banned) if (new RegExp(`["'\`]${w}["'\`]`).test(src)) bad.push(`${f}: "${w}"`);
}
if (bad.length) { console.error('English UI strings in bundle:\n' + bad.join('\n')); process.exit(1); }
console.log('bundle scan clean');
