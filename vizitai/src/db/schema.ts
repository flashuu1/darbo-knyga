import type { Transaction } from 'dexie';
import { t, type Key } from '../i18n/lt';

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
export const SCHEMA_VERSION = versions[versions.length - 1].version;
