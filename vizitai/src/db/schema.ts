import type { Transaction } from 'dexie';
import { defaultPersonalNames, t, type Key } from '../i18n/lt';
import { newId } from '../logic/id';

export interface SchemaVersion {
  version: number;
  stores: Record<string, string | null>;
  upgrade?: (tx: Transaction) => void | PromiseLike<unknown>;
}
// Append new versions; never remove a store (Dexie keeps unspecified stores).
// A future v2 must also migrate older-schema backup files in parseBackup/importData (logic/backup.ts).
export const versions: SchemaVersion[] = [
  {
    version: 1,
    stores: {
      clients: 'id, nameKey',
      appointments: 'id, clientId, start, status',
      services: 'id, order',
      settings: 'id',
    },
  },
];
// v2: every service defaults to 15 minutes. Services still carrying the old built-in lengths (45/90/120/120/60/30)
// become 15; a length she set herself to anything else is kept.
const OLD_DEFAULT_MINUTES = () => new Map<string, number>([
  [t('service.default.cut'), 45], [t('service.default.color'), 90], [t('service.default.cutColor'), 120],
  [t('service.default.highlights'), 120], [t('service.default.style'), 60], [t('service.default.other'), 30],
]);
versions.push({
  version: 2,
  stores: {},
  upgrade: (tx) => {
    const old = OLD_DEFAULT_MINUTES();
    return tx.table('services').toCollection().modify((s: { name: string; minutes: number }) => { if (old.get(s.name) === s.minutes) s.minutes = 15; });
  },
});
export const defaultPersonalOptions = () => defaultPersonalNames.map((name, order) => ({ id: newId(), group: 'personal' as const, name, order, minutes: 30 }));

// v3: her own choices for personal entries and for expenses (money out). They start empty: she creates them in Settings.
versions.push({ version: 3, stores: { options: 'id, group, order' } });
// v4: version 3 first shipped with example choices; those templates are removed (a name she changed is hers and stays).
const TEMPLATE_NAMES = () => new Set([
  'option.personal.lunch', 'option.personal.break', 'option.personal.doctor', 'option.personal.errands',
  'option.expense.supplies', 'option.expense.rent', 'option.expense.taxes', 'option.expense.other',
].map((k) => t(k as Key)));
versions.push({
  version: 4,
  stores: {},
  upgrade: (tx) => { const names = TEMPLATE_NAMES(); return tx.table('options').filter((o: { name: string }) => names.has(o.name)).delete(); },
});
// v5: the service Vestuvės (long, with flowers while it is coming up or waiting for its payment). Added once, before "Kita".
versions.push({
  version: 5,
  stores: {},
  upgrade: async (tx) => {
    const services = tx.table('services');
    const all = await services.toArray() as { id: string; name: string; order: number }[];
    if (all.length === 0 || all.some((s) => s.name === t('service.default.wedding'))) return; // a fresh install seeds it itself
    const kita = all.find((s) => s.name === t('service.default.other'));
    const order = kita ? kita.order : Math.max(...all.map((s) => s.order)) + 1;
    if (kita) await services.update(kita.id, { order: kita.order + 1 });
    await services.add({ id: newId(), name: t('service.default.wedding'), color: 'pink', minutes: 240, order, active: true, floral: true });
  },
});
// v6: Asmeninis starts with common words (psichologas, daktaras, ...), added once; hers to change. Words she already has are not doubled.
versions.push({
  version: 6,
  stores: {},
  upgrade: async (tx) => {
    const options = tx.table('options');
    const mine = (await options.toArray() as { group: string; name: string; order: number }[]).filter((o) => o.group === 'personal');
    const have = new Set(mine.map((o) => o.name.trim().toLocaleLowerCase('lt')));
    const next = mine.length ? Math.max(...mine.map((o) => o.order)) + 1 : 0;
    const add = defaultPersonalOptions().filter((o) => !have.has(o.name.toLocaleLowerCase('lt'))).map((o, i) => ({ ...o, order: next + i }));
    if (add.length) await options.bulkAdd(add);
  },
});
export const SCHEMA_VERSION = versions[versions.length - 1].version;
