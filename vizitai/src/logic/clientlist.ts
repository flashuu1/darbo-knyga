import type { ClientRow } from '../db/repo';
import { foldName, ltCollator } from './names';
import { addDays, datePart } from './time';

/** What the list can be narrowed to. 'auto' is everybody, in the order the app has always used (see repo.listClients). */
export type ClientFilter = 'auto' | 'due' | 'week' | 'old' | 'recent';
export type ClientSort = 'auto' | 'az' | 'last' | 'spent' | 'visits';
export const FILTERS: ClientFilter[] = ['auto', 'due', 'week', 'old', 'recent'];
export const TILE_FILTERS: ClientFilter[] = ['due', 'week', 'old', 'recent'];
export const SORTS: ClientSort[] = ['auto', 'az', 'last', 'spent', 'visits'];
export const OLD_DAYS = 60, RECENT_DAYS = 14;

const daysSince = (date: string | null, today: string) => (date ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000) : null);

export const filterTest = (f: ClientFilter, r: ClientRow, now: string): boolean => {
  const today = datePart(now), since = daysSince(r.lastVisit, today);
  switch (f) {
    case 'auto': return true;
    case 'due': return !!r.pending;
    case 'week': return !!r.nextVisit && datePart(r.nextVisit) <= addDays(today, 7);
    case 'old': return !r.pending && since !== null && since >= OLD_DAYS;
    case 'recent': return since !== null && since <= RECENT_DAYS;
  }
};
/** Each filter's own natural order (the 'auto' filter keeps the order of listClients). */
const filterOrder = (f: ClientFilter): ((a: ClientRow, b: ClientRow) => number) | null => {
  switch (f) {
    case 'due': return (a, b) => a.pending!.start.localeCompare(b.pending!.start);
    case 'week': return (a, b) => a.nextVisit!.localeCompare(b.nextVisit!);
    case 'old': return (a, b) => (a.lastVisit ?? '').localeCompare(b.lastVisit ?? '');
    case 'recent': return (a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? '');
    default: return null;
  }
};
const byName = (a: ClientRow, b: ClientRow) => ltCollator.compare(a.client.name, b.client.name);
const sortFn = (s: ClientSort, f: ClientFilter): ((a: ClientRow, b: ClientRow) => number) | null => {
  switch (s) {
    case 'az': return byName;
    case 'last': return (a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? '') || byName(a, b);
    case 'spent': return (a, b) => b.spentCents - a.spentCents || byName(a, b);
    case 'visits': return (a, b) => b.visitCount - a.visitCount || byName(a, b);
    default: return filterOrder(f);
  }
};

/** Name (without diacritics) or phone digits. */
export const matchesQuery = (r: ClientRow, q: string): boolean => {
  const key = foldName(q);
  if (!key) return true;
  if (r.client.nameKey.includes(key)) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3 && (r.client.phone ?? '').replace(/\D/g, '').includes(digits);
};

export function applyClients(rows: ClientRow[], f: ClientFilter, s: ClientSort, q: string, now: string): ClientRow[] {
  const list = rows.filter((r) => filterTest(f, r, now) && matchesQuery(r, q));
  const cmp = sortFn(s, f);
  return cmp ? [...list].sort(cmp) : list; // 'auto' + 'auto': listClients already put them in order
}
export const countFor = (rows: ClientRow[], f: ClientFilter, now: string) => rows.filter((r) => filterTest(f, r, now)).length;
