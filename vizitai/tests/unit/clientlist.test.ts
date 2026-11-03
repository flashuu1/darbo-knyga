import { describe, it, expect } from 'vitest';
import type { ClientRow } from '../../src/db/repo';
import { applyClients, countFor, filterTest, matchesQuery } from '../../src/logic/clientlist';

const NOW = '2026-11-03T10:24';
let n = 0;
const row = (name: string, p: Partial<ClientRow> = {}, phone?: string): ClientRow => ({
  client: { id: `c${n++}`, name, nameKey: name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(), phone, createdAt: '', updatedAt: '' },
  lastVisit: null, pending: null, paid: null, visitCount: 0, spentCents: 0, nextVisit: null, nextId: null, lastId: null, ...p,
});
// in the order listClients gives them: waiting, paid lately, next visit, the rest A-Z
const rows = [
  row('Aaa Laukia', { pending: { id: 'p', start: '2026-10-31T10:00' }, lastVisit: '2026-10-31', visitCount: 3, spentCents: 9000 }),
  row('Bbb Sumokėjo', { paid: { id: 'q', cents: 4500, start: '2026-10-30T10:00' }, lastVisit: '2026-10-30', visitCount: 9, spentCents: 40000 }, '+370 600 11122'),
  row('Ccc Ateis', { nextVisit: '2026-11-06T10:00', lastVisit: '2026-10-01', visitCount: 5, spentCents: 25000 }),
  row('Ddd Vėliau', { nextVisit: '2026-11-20T10:00', lastVisit: '2026-07-01', visitCount: 2, spentCents: 7000 }),
  row('Ąžuolė Sena', { lastVisit: '2026-06-01', visitCount: 12, spentCents: 60000 }),
  row('Eee Nauja', { lastVisit: '2026-11-01', visitCount: 1, spentCents: 3500 }),
  row('Fff Tuščia'),
];
const names = (l: ClientRow[]) => l.map((r) => r.client.name);

describe('the Klientai list', () => {
  it('"Automatiškai" keeps the order of the app: waiting, paid lately, next visit, the rest', () => {
    expect(names(applyClients(rows, 'auto', 'auto', '', NOW))).toEqual(names(rows));
  });
  it('filters: waiting, coming this week, long gone, seen lately', () => {
    expect(names(applyClients(rows, 'due', 'auto', '', NOW))).toEqual(['Aaa Laukia']);
    expect(names(applyClients(rows, 'week', 'auto', '', NOW))).toEqual(['Ccc Ateis']);
    expect(names(applyClients(rows, 'old', 'auto', '', NOW))).toEqual(['Ąžuolė Sena', 'Ddd Vėliau']); // the longest-gone first
    expect(names(applyClients(rows, 'recent', 'auto', '', NOW))).toEqual(['Eee Nauja', 'Aaa Laukia', 'Bbb Sumokėjo']);
    expect(countFor(rows, 'old', NOW)).toBe(2);
    expect(filterTest('old', rows[0]!, NOW)).toBe(false); // waiting for an amount is never "long gone"
  });
  it('sorts by name (Lithuanian rules), last visit, money and visits', () => {
    expect(names(applyClients(rows, 'auto', 'az', '', NOW))[0]).toBe('Aaa Laukia');
    expect(names(applyClients(rows, 'auto', 'az', '', NOW))).toContain('Ąžuolė Sena');
    expect(names(applyClients(rows, 'auto', 'last', '', NOW)).slice(0, 3)).toEqual(['Eee Nauja', 'Aaa Laukia', 'Bbb Sumokėjo']);
    expect(names(applyClients(rows, 'auto', 'spent', '', NOW)).slice(0, 2)).toEqual(['Ąžuolė Sena', 'Bbb Sumokėjo']);
    expect(names(applyClients(rows, 'auto', 'visits', '', NOW)).slice(0, 2)).toEqual(['Ąžuolė Sena', 'Bbb Sumokėjo']);
  });
  it('searches the name without diacritics, and the phone by its digits', () => {
    expect(names(applyClients(rows, 'auto', 'auto', 'azuole', NOW))).toEqual(['Ąžuolė Sena']);
    expect(names(applyClients(rows, 'auto', 'auto', '600 111', NOW))).toEqual(['Bbb Sumokėjo']);
    expect(matchesQuery(rows[1]!, '22')).toBe(false); // too few digits to be a phone search
    expect(names(applyClients(rows, 'due', 'auto', 'sumokejo', NOW))).toEqual([]); // the search narrows the filter
  });
});
