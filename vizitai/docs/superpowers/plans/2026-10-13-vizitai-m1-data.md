# M1 – Data layer

Read the index first. Branch: `m1-data` (from updated `main`). **Done when:** unit tests pass for data-model rules 1–5, the DST case and the export/import round trip. No UI in this milestone.

### Task 5: Types, wall-clock time, names, overlap

**Files:**
- Create: `src/db/types.ts`, `src/logic/time.ts`, `src/logic/names.ts`, `src/logic/overlap.ts`
- Test: `tests/unit/time.test.ts`, `tests/unit/names.test.ts`, `tests/unit/overlap.test.ts`

**Interfaces:**
- Produces (`types.ts`):
```ts
export type ServiceColor = 'blue'|'green'|'indigo'|'orange'|'pink'|'purple'|'red'|'teal'|'yellow'|'gray';
export type CancelReason = 'client' | 'ill' | 'other';
export interface Client { id: string; name: string; nameKey: string; phone?: string; createdAt: string; updatedAt: string }
export interface Move { at: string; from: string; to: string }
export interface Appointment {
  id: string; kind: 'client' | 'personal'; clientId: string | null; title: string | null; serviceId: string | null;
  start: string; status: 'booked' | 'cancelled' | 'noshow'; cancelReason: CancelReason | null; cancelledAt: string | null;
  moves: Move[]; createdAt: string; updatedAt: string;
}
export interface Service { id: string; name: string; color: ServiceColor; minutes: number; order: number; active: boolean }
export interface Settings { id: 'settings'; dayStart: string; dayEnd: string; slotMinutes: number; lastBackupAt: string | null; persistGranted: boolean | null }
```
- Produces (`time.ts`): `parse(s): number` (wall-clock minutes), `format(min): string`, `addMinutes(s, n)`, `addDays(date, n)`, `datePart(s)`, `timePart(s)`, `minutesOfDay(s)`, `hhmm(min)`, `snap(s, slot?, mode?)`, `weekStart(date)`, `nowLocal(d?)`, `todayStr(d?)`.
- Produces (`names.ts`): `cleanName(s)`, `foldName(s)`, `ltCollator`.
- Produces (`overlap.ts`): `PERSONAL_MINUTES = 60`, `minutesFor(a, services: Map<string, Service>)`, `blocksOverlap(a: Block, b: Block)`, `findOverlap(candidate: Block, booked: Appointment[], services)`, `nextFreeSlot(from: string, blocks: Block[], dayEndMin: number, slot?)`, where `Block = { id: string; start: string; minutes: number }`.

- [ ] **Step 1: Write `src/db/types.ts`** exactly as above (no test needed; compile-checked).

- [ ] **Step 2: Write failing tests**

`tests/unit/time.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { addDays, addMinutes, format, parse, snap, timePart, weekStart, nowLocal, minutesOfDay, hhmm } from '../../src/logic/time';

describe('wall-clock time', () => {
  it('keeps 10:00 on the DST change day (2026-10-25)', () => {
    expect(format(parse('2026-10-25T10:00'))).toBe('2026-10-25T10:00');
    expect(timePart('2026-10-25T10:00')).toBe('10:00');
  });
  it('does arithmetic on the wall clock through the DST night', () => {
    expect(addMinutes('2026-10-25T02:45', 30)).toBe('2026-10-25T03:15');
    expect(addMinutes('2026-10-25T03:30', 60)).toBe('2026-10-25T04:30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
  it('finds the Monday of a week, including across year end', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });
  it('snaps to the 15-minute grid', () => {
    expect(snap('2026-10-14T10:07')).toBe('2026-10-14T10:00');
    expect(snap('2026-10-14T10:08')).toBe('2026-10-14T10:15');
    expect(snap('2026-10-14T10:01', 15, 'ceil')).toBe('2026-10-14T10:15');
    expect(snap('2026-10-14T10:14', 15, 'floor')).toBe('2026-10-14T10:00');
    expect(snap('2026-10-14T10:15', 15, 'ceil')).toBe('2026-10-14T10:15');
  });
  it('reads the local clock without UTC conversion', () => {
    expect(nowLocal(new Date(2026, 9, 14, 9, 5))).toBe('2026-10-14T09:05');
  });
  it('converts minutes of day', () => {
    expect(minutesOfDay('2026-10-14T08:30')).toBe(510);
    expect(hhmm(510)).toBe('08:30');
  });
  it('rejects malformed strings', () => {
    expect(() => parse('2026-10-14 10:00')).toThrow();
  });
});
```

`tests/unit/names.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cleanName, foldName, ltCollator } from '../../src/logic/names';

describe('names', () => {
  it('trims and collapses spaces', () => expect(cleanName('  Jonas   Jonaitis ')).toBe('Jonas Jonaitis'));
  it('folds Lithuanian diacritics and case', () => {
    expect(foldName('Žydrūnė')).toBe('zydrune');
    expect(foldName('ĄČĘĖĮŠŲŪŽ')).toBe('aceeisuuz');
    expect(foldName('  ŽYDRŪNĖ  ')).toBe('zydrune');
  });
  it('sorts with lt rules (Z before Ž, Y between I and K)', () => {
    expect(['Žydrūnė', 'Zita'].sort(ltCollator.compare)).toEqual(['Zita', 'Žydrūnė']);
    expect(['Jonas', 'Yra', 'Ilona'].sort(ltCollator.compare)).toEqual(['Ilona', 'Yra', 'Jonas']);
  });
});
```

`tests/unit/overlap.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findOverlap, nextFreeSlot, PERSONAL_MINUTES, minutesFor } from '../../src/logic/overlap';
import type { Appointment, Service } from '../../src/db/types';

const svc = (id: string, minutes: number): Service => ({ id, name: id, color: 'blue', minutes, order: 0, active: true });
const services = new Map([['cut', svc('cut', 60)], ['short', svc('short', 30)]]);
const appt = (id: string, start: string, o: Partial<Appointment> = {}): Appointment => ({
  id, kind: 'client', clientId: 'c', title: null, serviceId: 'cut', start, status: 'booked', cancelReason: null,
  cancelledAt: null, moves: [], createdAt: '', updatedAt: '', ...o,
});

describe('overlap', () => {
  const booked = [appt('a', '2026-10-14T10:00')];
  it('detects an intersecting start', () => {
    expect(findOverlap({ id: 'n', start: '2026-10-14T10:30', minutes: 30 }, booked, services)?.id).toBe('a');
  });
  it('treats the end of a block as free', () => {
    expect(findOverlap({ id: 'n', start: '2026-10-14T11:00', minutes: 30 }, booked, services)).toBeUndefined();
  });
  it('detects a candidate that ends inside an existing block', () => {
    expect(findOverlap({ id: 'n', start: '2026-10-14T09:30', minutes: 60 }, booked, services)?.id).toBe('a');
  });
  it('ignores cancelled and no-show entries', () => {
    const list = [appt('x', '2026-10-14T10:00', { status: 'cancelled' }), appt('y', '2026-10-14T10:00', { status: 'noshow' })];
    expect(findOverlap({ id: 'n', start: '2026-10-14T10:00', minutes: 30 }, list, services)).toBeUndefined();
  });
  it('ignores the appointment itself', () => {
    expect(findOverlap({ id: 'a', start: '2026-10-14T10:00', minutes: 60 }, booked, services)).toBeUndefined();
  });
  it('gives personal entries the default length', () => {
    const p = appt('p', '2026-10-14T12:00', { kind: 'personal', serviceId: null, clientId: null, title: 'Pietūs' });
    expect(minutesFor(p, services)).toBe(PERSONAL_MINUTES);
    expect(findOverlap({ id: 'n', start: '2026-10-14T12:45', minutes: 30 }, [p], services)?.id).toBe('p');
  });
  it('finds the next free slot after now', () => {
    const blocks = [{ id: 'a', start: '2026-10-14T10:00', minutes: 60 }];
    expect(nextFreeSlot('2026-10-14T09:05', blocks, 20 * 60)).toBe('2026-10-14T09:15');
    expect(nextFreeSlot('2026-10-14T10:05', blocks, 20 * 60)).toBe('2026-10-14T11:00');
  });
});
```

- [ ] **Step 3: Run** `npm test` → FAIL (modules missing).

- [ ] **Step 4: Implement**

`src/logic/time.ts`:
```ts
// Wall-clock arithmetic: components are treated as UTC fields so DST never shifts anything.
const RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function parse(s: string): number {
  const m = RE.exec(s);
  if (!m) throw new Error(`Bad local datetime: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}
export function format(min: number): string {
  const d = new Date(min * 60000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export const addMinutes = (s: string, n: number) => format(parse(s) + n);
export const datePart = (s: string) => s.slice(0, 10);
export const timePart = (s: string) => s.slice(11, 16);
export const addDays = (date: string, n: number) => datePart(addMinutes(`${date.slice(0, 10)}T00:00`, n * 1440));
export const minutesOfDay = (s: string) => +s.slice(11, 13) * 60 + +s.slice(14, 16);
export const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function snap(s: string, slot = 15, mode: 'round' | 'floor' | 'ceil' = 'round'): string {
  const m = parse(s);
  const r = ((m % slot) + slot) % slot;
  const base = m - r;
  const v = mode === 'floor' ? base : mode === 'ceil' ? (r ? base + slot : base) : r * 2 >= slot ? base + slot : base;
  return format(v);
}
export function weekStart(date: string): string {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}
export function nowLocal(d: Date = new Date()): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const todayStr = (d?: Date) => datePart(nowLocal(d));
```

`src/logic/names.ts`:
```ts
export const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ');
export const foldName = (s: string) => cleanName(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const ltCollator = new Intl.Collator('lt');
```

`src/logic/overlap.ts`:
```ts
import type { Appointment, Service } from '../db/types';
import { addMinutes, format, minutesOfDay, parse, snap } from './time';

export const PERSONAL_MINUTES = 60;
export interface Block { id: string; start: string; minutes: number }

export function minutesFor(a: Appointment, services: Map<string, Service>): number {
  if (a.kind === 'personal' || !a.serviceId) return PERSONAL_MINUTES;
  return services.get(a.serviceId)?.minutes ?? PERSONAL_MINUTES;
}
export function blocksOverlap(a: Block, b: Block): boolean {
  const as = parse(a.start), bs = parse(b.start);
  return as < bs + b.minutes && bs < as + a.minutes;
}
export function findOverlap(candidate: Block, booked: Appointment[], services: Map<string, Service>): Appointment | undefined {
  return booked.find(
    (a) => a.id !== candidate.id && a.status === 'booked' &&
      blocksOverlap(candidate, { id: a.id, start: a.start, minutes: minutesFor(a, services) }),
  );
}
export function nextFreeSlot(from: string, blocks: Block[], dayEndMin: number, slot = 15): string {
  let s = snap(from, slot, 'ceil');
  for (let i = 0; i < 200; i++) {
    const hit = blocks.find((b) => blocksOverlap({ id: '', start: s, minutes: slot }, b));
    if (!hit || minutesOfDay(s) >= dayEndMin) return s;
    s = snap(addMinutes(hit.start, hit.minutes), slot, 'ceil');
  }
  return format(parse(s));
}
```

- [ ] **Step 5: Run** `npm test` → all PASS. If the `lt` collation assertions fail, Node lacks full ICU: use Node 20+ official build.

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "feat: add types, wall-clock time, name folding and overlap logic"
```

### Task 6: Dexie schema, seed, repository

**Files:**
- Create: `src/db/schema.ts`, `src/db/seed.ts`, `src/db/repo.ts`
- Replace: `src/db/db.ts` (M0 stub)
- Test: `tests/unit/repo.test.ts`, `tests/unit/schema.test.ts`

**Interfaces:**
- Produces: `SchemaVersion`, `versions`, `SCHEMA_VERSION`; `class VizitaiDB extends Dexie { clients; appointments; services; settings; constructor(name?, extraVersions?) }`; `db` singleton; `DEFAULT_SETTINGS`; `ensureSeed(db): Promise<void>`.
- Produces `createRepo(db)` returning:
```ts
interface Entry { appt: Appointment; label: string; service: Service | null; minutes: number; color: ServiceColor }
getSettings(): Promise<Settings>; updateSettings(p: Partial<Settings>): Promise<void>
listServices(activeOnly?: boolean): Promise<Service[]>
addService(name: string, color?: ServiceColor, minutes?: number): Promise<Service>
updateService(id: string, p: Partial<Pick<Service,'name'|'color'|'minutes'>>): Promise<void>
moveService(id: string, dir: -1 | 1): Promise<void>
setServiceActive(id: string, active: boolean): Promise<void>   // throws Error('last-active') when hiding the last active one
getClient(id: string): Promise<Client | undefined>
matchOrCreateClient(rawName: string): Promise<Client>
searchClients(query: string, limit?: number): Promise<Client[]>   // empty query -> recentClients(5)
recentClients(limit?: number): Promise<Client[]>
updateClient(id: string, p: { name?: string; phone?: string }): Promise<void>
lastServiceId(clientId: string): Promise<string | null>
createAppointment(i: { kind: 'client'|'personal'; name?: string; title?: string; serviceId?: string | null; start: string }): Promise<Appointment>
getAppointment(id: string): Promise<Appointment | undefined>
updateAppointment(id: string, p: Partial<Pick<Appointment,'serviceId'>>): Promise<Appointment>
moveAppointment(id: string, to: string): Promise<{ before: Appointment; after: Appointment }>
cancelAppointment(id: string, reason: CancelReason | null): Promise<{ before: Appointment; after: Appointment }>
markNoShow(id: string): Promise<{ before: Appointment; after: Appointment }>
restoreAppointment(id: string): Promise<{ before: Appointment; after: Appointment }>
putSnapshot(a: Appointment): Promise<void>      // undo
findOverlapFor(i: { start: string; kind: 'client'|'personal'; serviceId: string | null; excludeId?: string }): Promise<{ label: string; serviceName: string } | undefined>
entriesBetween(fromDate: string, toDateExclusive: string): Promise<Entry[]>
countsByDate(fromDate: string, toDateExclusive: string): Promise<Map<string, number>>
defaultStartFor(date: string, now?: string): Promise<string>
listClients(now?: string): Promise<{ client: Client; lastVisit: string | null }[]>
clientDetail(id: string, now?: string): Promise<{ client: Client; upcoming: Entry[]; past: Entry[]; visitCount: number; cancelled: number; noshow: number }>
```
- `export const repo = createRepo(db)`.

- [ ] **Step 1: Write failing tests**

`tests/unit/repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { VizitaiDB } from '../../src/db/db';
import { ensureSeed } from '../../src/db/seed';
import { createRepo } from '../../src/db/repo';

let db: VizitaiDB;
let repo: ReturnType<typeof createRepo>;
beforeEach(async () => {
  db = new VizitaiDB(`t-${crypto.randomUUID()}`);
  await ensureSeed(db);
  repo = createRepo(db);
});
const firstService = async () => (await repo.listServices(true))[0];

describe('seed', () => {
  it('creates six services and default settings once', async () => {
    expect((await repo.listServices()).map((s) => s.name)).toEqual(['Kirpimas', 'Dažymas', 'Kirpimas ir dažymas', 'Sruogelės', 'Šukuosena', 'Kita']);
    await ensureSeed(db);
    expect(await db.services.count()).toBe(6);
    expect((await repo.getSettings()).dayStart).toBe('08:00');
  });
});

describe('rule 1: match or create client', () => {
  it('links an existing client regardless of case and diacritics', async () => {
    const a = await repo.matchOrCreateClient('Žydrūnė');
    const b = await repo.matchOrCreateClient('  zydrune ');
    expect(b.id).toBe(a.id);
    expect(await db.clients.count()).toBe(1);
  });
  it('stores the cleaned name and its folded key', async () => {
    const c = await repo.matchOrCreateClient('  Jonas   Jonaitis ');
    expect(c.name).toBe('Jonas Jonaitis');
    expect(c.nameKey).toBe('jonas jonaitis');
  });
  it('rejects an empty name', async () => {
    await expect(repo.matchOrCreateClient('   ')).rejects.toThrow();
  });
});

describe('rule 4: search by folded key', () => {
  it('finds Žydrūnė with "zydrune" and "ZYD"', async () => {
    await repo.matchOrCreateClient('Žydrūnė');
    await repo.matchOrCreateClient('Ona');
    expect((await repo.searchClients('zydrune')).map((c) => c.name)).toEqual(['Žydrūnė']);
    expect((await repo.searchClients('ZYD')).map((c) => c.name)).toEqual(['Žydrūnė']);
  });
  it('lists the 5 most recent clients for an empty query', async () => {
    const s = await firstService();
    for (let i = 0; i < 7; i++) {
      await repo.createAppointment({ kind: 'client', name: `Klientas ${i}`, serviceId: s.id, start: `2026-10-14T${String(8 + i).padStart(2, '0')}:00` });
    }
    const recent = await repo.searchClients('');
    expect(recent).toHaveLength(5);
    expect(recent[0].name).toBe('Klientas 6');
  });
});

describe('appointments', () => {
  it('snaps start to the grid and keeps wall-clock text', async () => {
    const s = await firstService();
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-25T10:07' });
    expect(a.start).toBe('2026-10-25T10:00');
  });
  it('creates personal entries with a title and no client or service', async () => {
    const a = await repo.createAppointment({ kind: 'personal', title: ' Pietūs ', start: '2026-10-14T12:00' });
    expect(a).toMatchObject({ kind: 'personal', title: 'Pietūs', clientId: null, serviceId: null });
  });
  it('moves, appends history, and undo restores the snapshot', async () => {
    const s = await firstService();
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    const { before, after } = await repo.moveAppointment(a.id, '2026-10-15T14:00');
    expect(after.start).toBe('2026-10-15T14:00');
    expect(after.moves).toHaveLength(1);
    expect(after.moves[0]).toMatchObject({ from: '2026-10-14T10:00', to: '2026-10-15T14:00' });
    await repo.putSnapshot(before);
    expect((await repo.getAppointment(a.id))!.start).toBe('2026-10-14T10:00');
  });
  it('cancels with and without a reason, and restores', async () => {
    const s = await firstService();
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    const c1 = await repo.cancelAppointment(a.id, 'ill');
    expect(c1.after).toMatchObject({ status: 'cancelled', cancelReason: 'ill' });
    expect(c1.after.cancelledAt).not.toBeNull();
    const r = await repo.restoreAppointment(a.id);
    expect(r.after).toMatchObject({ status: 'booked', cancelReason: null, cancelledAt: null });
    const c2 = await repo.cancelAppointment(a.id, null);
    expect(c2.after.cancelReason).toBeNull();
  });
  it('a cancelled slot accepts a new booking without warning', async () => {
    const s = await firstService();
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    await repo.cancelAppointment(a.id, null);
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:00', kind: 'client', serviceId: s.id })).toBeUndefined();
  });
});

describe('rules 2-3: overlap warns using the hidden service length', () => {
  it('reports the clashing name and service', async () => {
    const s = await firstService(); // Kirpimas, 45 min
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:30', kind: 'client', serviceId: s.id }))
      .toEqual({ label: 'Ona', serviceName: 'Kirpimas' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:45', kind: 'client', serviceId: s.id })).toBeUndefined();
  });
  it('excludes the entry being moved', async () => {
    const s = await firstService();
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:15', kind: 'client', serviceId: s.id, excludeId: a.id })).toBeUndefined();
  });
});

describe('queries', () => {
  it('returns entries for a date range with labels and colours', async () => {
    const s = await firstService();
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    await repo.createAppointment({ kind: 'personal', title: 'Pietūs', start: '2026-10-14T12:00' });
    await repo.createAppointment({ kind: 'client', name: 'Jonas', serviceId: s.id, start: '2026-10-15T10:00' });
    const e = await repo.entriesBetween('2026-10-14', '2026-10-15');
    expect(e.map((x) => x.label)).toEqual(['Ona', 'Pietūs']);
    expect(e[0]).toMatchObject({ minutes: 45, color: 'blue' });
    expect(e[1].minutes).toBe(60);
  });
  it('counts booked entries per date', async () => {
    const s = await firstService();
    await repo.createAppointment({ kind: 'client', name: 'A', serviceId: s.id, start: '2026-10-14T10:00' });
    const b = await repo.createAppointment({ kind: 'client', name: 'B', serviceId: s.id, start: '2026-10-14T12:00' });
    await repo.cancelAppointment(b.id, null);
    expect((await repo.countsByDate('2026-10-12', '2026-10-19')).get('2026-10-14')).toBe(1);
  });
  it('proposes dayStart on other days and the next free slot today', async () => {
    const s = await firstService();
    await repo.createAppointment({ kind: 'client', name: 'A', serviceId: s.id, start: '2026-10-14T10:00' });
    expect(await repo.defaultStartFor('2026-10-15', '2026-10-14T09:05')).toBe('2026-10-15T08:00');
    expect(await repo.defaultStartFor('2026-10-14', '2026-10-14T09:05')).toBe('2026-10-14T09:15');
    expect(await repo.defaultStartFor('2026-10-14', '2026-10-14T10:05')).toBe('2026-10-14T10:45');
  });
  it('remembers the last service of a client', async () => {
    const [s1, s2] = await repo.listServices(true);
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s1.id, start: '2026-10-14T10:00' });
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s2.id, start: '2026-10-20T10:00' });
    expect(await repo.lastServiceId(a.clientId!)).toBe(s2.id);
  });
  it('sorts the client list with the lt collator and reports last visit', async () => {
    const s = await firstService();
    for (const n of ['Žydrūnė', 'Zita', 'Ona']) await repo.createAppointment({ kind: 'client', name: n, serviceId: s.id, start: '2026-10-01T10:00' });
    const list = await repo.listClients('2026-10-14T09:00');
    expect(list.map((x) => x.client.name)).toEqual(['Ona', 'Zita', 'Žydrūnė']);
    expect(list[0].lastVisit).toBe('2026-10-01');
  });
  it('summarises a client card', async () => {
    const s = await firstService();
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-01T10:00' });
    const b = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-05T10:00' });
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-20T10:00' });
    await repo.cancelAppointment(b.id, 'client');
    const c = await repo.clientDetail(a.clientId!, '2026-10-14T09:00');
    expect(c).toMatchObject({ visitCount: 1, cancelled: 1, noshow: 0 });
    expect(c.upcoming).toHaveLength(1);
    expect(c.past).toHaveLength(2);
  });
});

describe('services', () => {
  it('hides a service without deleting it, and refuses to hide the last active one', async () => {
    const all = await repo.listServices();
    for (const s of all.slice(1)) await repo.setServiceActive(s.id, false);
    expect(await db.services.count()).toBe(6);
    await expect(repo.setServiceActive(all[0].id, false)).rejects.toThrow('last-active');
  });
  it('keeps hidden service labels on old appointments', async () => {
    const [s1, s2] = await repo.listServices(true);
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s2.id, start: '2026-10-14T10:00' });
    await repo.setServiceActive(s2.id, false);
    const e = await repo.entriesBetween('2026-10-14', '2026-10-15');
    expect(e[0].service?.name).toBe(s2.name);
    expect(s1.active).toBe(true);
  });
  it('reorders services', async () => {
    const [s1, s2] = await repo.listServices();
    await repo.moveService(s2.id, -1);
    const after = await repo.listServices();
    expect(after[0].id).toBe(s2.id);
    expect(after[1].id).toBe(s1.id);
  });
});
```

`tests/unit/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { VizitaiDB } from '../../src/db/db';
import { versions } from '../../src/db/schema';

describe('schema upgrades', () => {
  it('loses no records when a later version migrates the data', async () => {
    const name = `bump-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(versions[0].stores as Record<string, string>);
    await v1.table('clients').bulkAdd([{ id: 'c1', name: 'Ona', nameKey: 'ona' }, { id: 'c2', name: 'Jonas', nameKey: 'jonas' }]);
    await v1.table('appointments').bulkAdd([{ id: 'a1', clientId: 'c1', start: '2026-10-14T10:00', status: 'booked' }]);
    await v1.table('services').add({ id: 's1', name: 'Kirpimas', order: 0 });
    await v1.table('settings').add({ id: 'settings' });
    v1.close();

    const v2 = new VizitaiDB(name, [{
      version: 2,
      stores: { appointments: 'id, clientId, start, status, createdAt' },
      upgrade: (tx) => tx.table('appointments').toCollection().modify((a) => { a.createdAt = a.createdAt ?? 'migrated'; }),
    }]);
    await v2.open();
    expect(await v2.clients.count()).toBe(2);
    expect(await v2.appointments.count()).toBe(1);
    expect(await v2.services.count()).toBe(1);
    expect(await v2.settings.count()).toBe(1);
    expect(((await v2.appointments.get('a1')) as unknown as { createdAt: string }).createdAt).toBe('migrated');
    v2.close();
  });
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement schema, db, seed**

`src/db/schema.ts`:
```ts
import type { Transaction } from 'dexie';

export interface SchemaVersion {
  version: number;
  stores: Record<string, string | null>;
  upgrade?: (tx: Transaction) => void | Promise<void>;
}
// Append new versions; never remove a store (Dexie keeps unspecified stores).
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
export const SCHEMA_VERSION = versions[versions.length - 1].version;
```

`src/db/db.ts` (replaces the stub):
```ts
import Dexie, { type Table } from 'dexie';
import type { Appointment, Client, Service, Settings } from './types';
import { versions, type SchemaVersion } from './schema';

export class VizitaiDB extends Dexie {
  clients!: Table<Client, string>;
  appointments!: Table<Appointment, string>;
  services!: Table<Service, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'vizitai', extraVersions: SchemaVersion[] = []) {
    super(name);
    for (const v of [...versions, ...extraVersions]) {
      const ver = this.version(v.version).stores(v.stores);
      if (v.upgrade) ver.upgrade(v.upgrade);
    }
  }
}
export const db = new VizitaiDB();
```

`src/db/seed.ts` (replaces the stub; names come from `lt.ts` so there are no inline literals):
```ts
import { t } from '../i18n/lt';
import type { Service, Settings } from './types';
import type { VizitaiDB } from './db';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings', dayStart: '08:00', dayEnd: '20:00', slotMinutes: 15, lastBackupAt: null, persistGranted: null,
};

export async function ensureSeed(db: VizitaiDB): Promise<void> {
  await db.transaction('rw', db.settings, db.services, async () => {
    if (await db.settings.get('settings')) return; // seeded once; hiding services never re-seeds
    const defs: Omit<Service, 'id' | 'order' | 'active'>[] = [
      { name: t('service.default.cut'), color: 'blue', minutes: 45 },
      { name: t('service.default.color'), color: 'pink', minutes: 90 },
      { name: t('service.default.cutColor'), color: 'purple', minutes: 120 },
      { name: t('service.default.highlights'), color: 'orange', minutes: 120 },
      { name: t('service.default.style'), color: 'green', minutes: 60 },
      { name: t('service.default.other'), color: 'gray', minutes: 30 },
    ];
    await db.services.bulkAdd(defs.map((d, i) => ({ ...d, id: crypto.randomUUID(), order: i, active: true })));
    await db.settings.add({ ...DEFAULT_SETTINGS });
  });
}
```

- [ ] **Step 4: Implement `src/db/repo.ts`**

```ts
import type { Appointment, CancelReason, Client, Service, ServiceColor, Settings } from './types';
import type { VizitaiDB } from './db';
import { DEFAULT_SETTINGS } from './seed';
import { cleanName, foldName, ltCollator } from '../logic/names';
import { addDays, addMinutes, datePart, minutesOfDay, nowLocal, parse, snap } from '../logic/time';
import { findOverlap, minutesFor, nextFreeSlot, PERSONAL_MINUTES, type Block } from '../logic/overlap';
import { t } from '../i18n/lt';

export interface Entry { appt: Appointment; label: string; service: Service | null; minutes: number; color: ServiceColor }
const SLOT = 15;
const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

export function createRepo(db: VizitaiDB) {
  let lastTs = 0; // strictly increasing, so "most recent" ordering never ties within a millisecond
  const now = () => { lastTs = Math.max(Date.now(), lastTs + 1); return new Date(lastTs).toISOString(); };
  const uuid = () => crypto.randomUUID();
  const serviceMap = async () => new Map((await db.services.toArray()).map((s) => [s.id, s]));

  async function toEntries(list: Appointment[]): Promise<Entry[]> {
    const services = await serviceMap();
    const ids = [...new Set(list.map((a) => a.clientId).filter((x): x is string => !!x))];
    const clients = new Map((await db.clients.bulkGet(ids)).filter((c): c is Client => !!c).map((c) => [c.id, c]));
    return list.map((appt) => {
      const service = appt.serviceId ? services.get(appt.serviceId) ?? null : null;
      const label = appt.kind === 'personal' ? appt.title ?? '' : clients.get(appt.clientId ?? '')?.name ?? '';
      return { appt, label, service, minutes: minutesFor(appt, services), color: service?.color ?? 'gray' };
    });
  }
  const byStart = (a: Appointment, b: Appointment) => a.start.localeCompare(b.start);
  async function mutate(id: string, patch: (a: Appointment) => Appointment) {
    const before = await db.appointments.get(id);
    if (!before) throw new Error('not-found');
    const after = { ...patch(structuredClone(before)), updatedAt: now() };
    await db.appointments.put(after);
    return { before, after };
  }

  return {
    async getSettings(): Promise<Settings> { return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS; },
    async updateSettings(p: Partial<Settings>) { await db.settings.update('settings', p); },

    async listServices(activeOnly = false): Promise<Service[]> {
      const all = await db.services.orderBy('order').toArray();
      return activeOnly ? all.filter((s) => s.active) : all;
    },
    async addService(name: string, color: ServiceColor = 'teal', minutes = 60): Promise<Service> {
      const all = await db.services.toArray();
      const s: Service = { id: uuid(), name: cleanName(name) || t('service.new'), color, minutes, order: all.length ? Math.max(...all.map((x) => x.order)) + 1 : 0, active: true };
      await db.services.add(s);
      return s;
    },
    async updateService(id: string, p: Partial<Pick<Service, 'name' | 'color' | 'minutes'>>) { await db.services.update(id, p); },
    async moveService(id: string, dir: -1 | 1) {
      const all = await db.services.orderBy('order').toArray();
      const i = all.findIndex((s) => s.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= all.length) return;
      await db.transaction('rw', db.services, async () => {
        await db.services.update(all[i].id, { order: all[j].order });
        await db.services.update(all[j].id, { order: all[i].order });
      });
    },
    async setServiceActive(id: string, active: boolean) {
      if (!active) {
        const others = (await db.services.toArray()).filter((s) => s.active && s.id !== id);
        if (others.length === 0) throw new Error('last-active');
      }
      await db.services.update(id, { active });
    },

    getClient: (id: string) => db.clients.get(id),
    async matchOrCreateClient(rawName: string): Promise<Client> {
      const name = cleanName(rawName);
      if (!name) throw new Error('empty-name');
      const nameKey = foldName(name);
      const found = await db.clients.where('nameKey').equals(nameKey).first();
      if (found) return found;
      const ts = now();
      const c: Client = { id: uuid(), name, nameKey, createdAt: ts, updatedAt: ts };
      await db.clients.add(c);
      return c;
    },
    async recentClients(limit = 5): Promise<Client[]> {
      const appts = (await db.appointments.toArray()).filter((a) => a.clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const ids: string[] = [];
      for (const a of appts) { if (!ids.includes(a.clientId!)) ids.push(a.clientId!); if (ids.length === limit) break; }
      return (await db.clients.bulkGet(ids)).filter((c): c is Client => !!c);
    },
    async searchClients(query: string, limit = 8): Promise<Client[]> {
      const q = foldName(query);
      if (!q) return this.recentClients(5);
      const all = await db.clients.toArray();
      return all.filter((c) => c.nameKey.includes(q)).sort((a, b) => ltCollator.compare(a.name, b.name)).slice(0, limit);
    },
    async updateClient(id: string, p: { name?: string; phone?: string }) {
      const patch: Partial<Client> = { updatedAt: now() };
      if (p.name !== undefined) { const n = cleanName(p.name); if (n) { patch.name = n; patch.nameKey = foldName(n); } }
      if (p.phone !== undefined) patch.phone = p.phone.trim();
      await db.clients.update(id, patch);
    },
    async lastServiceId(clientId: string): Promise<string | null> {
      const list = (await db.appointments.where('clientId').equals(clientId).toArray())
        .filter((a) => a.serviceId && a.status !== 'cancelled').sort(byStart);
      return list.length ? list[list.length - 1].serviceId : null;
    },

    async createAppointment(i: { kind: 'client' | 'personal'; name?: string; title?: string; serviceId?: string | null; start: string }): Promise<Appointment> {
      const start = snap(i.start, SLOT);
      let clientId: string | null = null, title: string | null = null;
      if (i.kind === 'client') clientId = (await this.matchOrCreateClient(i.name ?? '')).id;
      else { title = cleanName(i.title ?? ''); if (!title) throw new Error('empty-title'); }
      const ts = now();
      const a: Appointment = {
        id: uuid(), kind: i.kind, clientId, title, serviceId: i.kind === 'client' ? i.serviceId ?? null : null, start,
        status: 'booked', cancelReason: null, cancelledAt: null, moves: [], createdAt: ts, updatedAt: ts,
      };
      await db.appointments.add(a);
      return a;
    },
    getAppointment: (id: string) => db.appointments.get(id),
    async updateAppointment(id: string, p: Partial<Pick<Appointment, 'serviceId'>>) { return (await mutate(id, (a) => ({ ...a, ...p }))).after; },
    moveAppointment(id: string, to: string) {
      const target = snap(to, SLOT);
      return mutate(id, (a) => ({ ...a, start: target, moves: [...a.moves, { at: now(), from: a.start, to: target }] }));
    },
    cancelAppointment(id: string, reason: CancelReason | null) {
      return mutate(id, (a) => ({ ...a, status: 'cancelled', cancelReason: reason, cancelledAt: now() }));
    },
    markNoShow(id: string) { return mutate(id, (a) => ({ ...a, status: 'noshow' })); },
    restoreAppointment(id: string) { return mutate(id, (a) => ({ ...a, status: 'booked', cancelReason: null, cancelledAt: null })); },
    async putSnapshot(a: Appointment) { await db.appointments.put(a); },

    async findOverlapFor(i: { start: string; kind: 'client' | 'personal'; serviceId: string | null; excludeId?: string }) {
      const services = await serviceMap();
      const minutes = i.kind === 'personal' || !i.serviceId ? PERSONAL_MINUTES : services.get(i.serviceId)?.minutes ?? PERSONAL_MINUTES;
      const lo = addMinutes(i.start, -1440), hi = addMinutes(i.start, 1440);
      const near = await db.appointments.where('start').between(lo, hi, true, true).toArray();
      const hit = findOverlap({ id: i.excludeId ?? '', start: i.start, minutes }, near, services);
      if (!hit) return undefined;
      const [e] = await toEntries([hit]);
      return { label: e.label, serviceName: e.service?.name ?? t('type.personal') };
    },

    async entriesBetween(fromDate: string, toDateExclusive: string): Promise<Entry[]> {
      const list = await db.appointments.where('start').between(`${fromDate}T00:00`, `${toDateExclusive}T00:00`, true, false).toArray();
      return toEntries(list.sort(byStart));
    },
    async countsByDate(fromDate: string, toDateExclusive: string): Promise<Map<string, number>> {
      const list = await db.appointments.where('start').between(`${fromDate}T00:00`, `${toDateExclusive}T00:00`, true, false).toArray();
      const m = new Map<string, number>();
      for (const a of list) if (a.status === 'booked') m.set(datePart(a.start), (m.get(datePart(a.start)) ?? 0) + 1);
      return m;
    },
    async defaultStartFor(date: string, now_: string = nowLocal()): Promise<string> {
      const s = await this.getSettings();
      if (datePart(now_) !== date) return `${date}T${s.dayStart}`;
      const services = await serviceMap();
      const list = (await db.appointments.where('start').between(`${date}T00:00`, `${addDays(date, 1)}T00:00`, true, false).toArray())
        .filter((a) => a.status === 'booked');
      const blocks: Block[] = list.map((a) => ({ id: a.id, start: a.start, minutes: minutesFor(a, services) }));
      const free = nextFreeSlot(now_, blocks, toMin(s.dayEnd));
      return datePart(free) === date ? free : `${date}T${s.dayStart}`;
    },

    async listClients(now_: string = nowLocal()): Promise<{ client: Client; lastVisit: string | null }[]> {
      const clients = await db.clients.toArray();
      const appts = await db.appointments.toArray();
      const last = new Map<string, string>();
      for (const a of appts) {
        if (!a.clientId || a.status === 'cancelled' || a.start > now_) continue;
        if (!last.has(a.clientId) || a.start > last.get(a.clientId)!) last.set(a.clientId, a.start);
      }
      return clients.sort((a, b) => ltCollator.compare(a.name, b.name)).map((client) => ({ client, lastVisit: last.has(client.id) ? datePart(last.get(client.id)!) : null }));
    },
    async clientDetail(id: string, now_: string = nowLocal()) {
      const client = await db.clients.get(id);
      if (!client) throw new Error('not-found');
      const all = await db.appointments.where('clientId').equals(id).toArray();
      const entries = await toEntries(all.sort(byStart));
      const upcoming = entries.filter((e) => e.appt.start > now_ && e.appt.status === 'booked');
      const past = entries.filter((e) => e.appt.start <= now_).reverse();
      return {
        client, upcoming, past,
        visitCount: past.filter((e) => e.appt.status === 'booked').length,
        cancelled: entries.filter((e) => e.appt.status === 'cancelled').length,
        noshow: entries.filter((e) => e.appt.status === 'noshow').length,
      };
    },
  };
}
export type Repo = ReturnType<typeof createRepo>;
```
Add at the bottom: `import { db } from './db'; export const repo = createRepo(db);` (move the import to the top of the file). Remove unused imports (`minutesOfDay`, `parse`) if the linter flags them.

- [ ] **Step 5: Run** `npm run typecheck && npm run lint && npm test` → PASS. Fix any failing assertion by fixing the code, not the test, unless the test contradicts the spec.

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "feat: add Dexie schema, seed and repository"
```

### Task 7: Backup export/import

**Files:**
- Create: `src/logic/backup.ts`
- Test: `tests/unit/backup.test.ts`

**Interfaces:**
- Consumes: `VizitaiDB`, `SCHEMA_VERSION`, `createRepo`.
- Produces:
```ts
interface BackupFile { app: 'vizitai'; schemaVersion: number; exportedAt: string; clients: Client[]; appointments: Appointment[]; services: Service[]; settings: Settings[] }
class BackupError extends Error { code: 'format' | 'newer' }
exportData(db): Promise<BackupFile>
parseBackup(text: string): BackupFile          // throws BackupError
importData(db, file: BackupFile): Promise<void> // replaces all rows in one transaction
backupFileName(d?: Date): string                // vizitai-YYYY-MM-DD.json
shareBackup(json: string, name: string): Promise<'shared' | 'downloaded' | 'cancelled'>
```

- [ ] **Step 1: Write failing tests** — `tests/unit/backup.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { VizitaiDB } from '../../src/db/db';
import { ensureSeed } from '../../src/db/seed';
import { createRepo } from '../../src/db/repo';
import { backupFileName, BackupError, exportData, importData, parseBackup, shareBackup } from '../../src/logic/backup';
import { SCHEMA_VERSION } from '../../src/db/schema';

async function seeded() {
  const db = new VizitaiDB(`b-${crypto.randomUUID()}`);
  await ensureSeed(db);
  const repo = createRepo(db);
  const [s] = await repo.listServices(true);
  const a = await repo.createAppointment({ kind: 'client', name: 'Žydrūnė', serviceId: s.id, start: '2026-10-25T10:00' });
  await repo.moveAppointment(a.id, '2026-10-26T11:15');
  await repo.createAppointment({ kind: 'personal', title: 'Pietūs', start: '2026-10-26T13:00' });
  return { db, repo };
}
const dump = async (db: VizitaiDB) => ({
  clients: await db.clients.toArray(), appointments: await db.appointments.toArray(),
  services: await db.services.toArray(), settings: await db.settings.toArray(),
});

describe('backup round trip', () => {
  it('export, clear, import gives identical records', async () => {
    const { db } = await seeded();
    const before = await dump(db);
    const json = JSON.stringify(await exportData(db));
    await Promise.all([db.clients.clear(), db.appointments.clear(), db.services.clear(), db.settings.clear()]);
    expect(await db.appointments.count()).toBe(0);
    await importData(db, parseBackup(json));
    expect(await dump(db)).toEqual(before);
  });
  it('includes the schema version and keeps wall-clock starts', async () => {
    const { db } = await seeded();
    const f = await exportData(db);
    expect(f.schemaVersion).toBe(SCHEMA_VERSION);
    expect(f.appointments.map((a) => a.start).sort()).toEqual(['2026-10-26T11:15', '2026-10-26T13:00']);
  });
});

describe('import validation (existing data untouched on failure)', () => {
  it('rejects non-JSON, foreign JSON and wrong shapes', () => {
    for (const bad of ['not json', '{}', '{"app":"other"}', JSON.stringify({ app: 'vizitai', schemaVersion: 1, clients: 'x' })]) {
      expect(() => parseBackup(bad)).toThrowError(BackupError);
    }
  });
  it('rejects a file from a newer schema', () => {
    const json = JSON.stringify({ app: 'vizitai', schemaVersion: SCHEMA_VERSION + 1, exportedAt: '', clients: [], appointments: [], services: [], settings: [] });
    try { parseBackup(json); expect.unreachable(); } catch (e) { expect((e as BackupError).code).toBe('newer'); }
  });
  it('does not touch the database when parsing fails', async () => {
    const { db } = await seeded();
    const before = await dump(db);
    expect(() => parseBackup('garbage')).toThrow();
    expect(await dump(db)).toEqual(before);
  });
});

describe('file name', () => {
  it('uses the local date', () => expect(backupFileName(new Date(2026, 9, 5))).toBe('vizitai-2026-10-05.json'));
});

describe('shareBackup', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reports cancelled when the share sheet is dismissed', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => { throw new DOMException('x', 'AbortError'); } });
    expect(await shareBackup('{}', 'x.json')).toBe('cancelled');
  });
  it('reports shared on success', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => {} });
    expect(await shareBackup('{}', 'x.json')).toBe('shared');
  });
  it('falls back to a download when sharing files is unsupported', async () => {
    const click = vi.fn();
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { createElement: () => ({ click, set href(_v: string) {}, set download(_v: string) {} }) });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    expect(await shareBackup('{}', 'x.json')).toBe('downloaded');
    expect(click).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `npm test -- backup` → FAIL.

- [ ] **Step 3: Implement** `src/logic/backup.ts`:

```ts
import type { Appointment, Client, Service, Settings } from '../db/types';
import type { VizitaiDB } from '../db/db';
import { SCHEMA_VERSION } from '../db/schema';

export interface BackupFile {
  app: 'vizitai'; schemaVersion: number; exportedAt: string;
  clients: Client[]; appointments: Appointment[]; services: Service[]; settings: Settings[];
}
export class BackupError extends Error {
  constructor(public code: 'format' | 'newer') { super(code); }
}

export async function exportData(db: VizitaiDB): Promise<BackupFile> {
  const [clients, appointments, services, settings] = await Promise.all([
    db.clients.toArray(), db.appointments.toArray(), db.services.toArray(), db.settings.toArray(),
  ]);
  return { app: 'vizitai', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), clients, appointments, services, settings };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new BackupError('format'); }
  const f = data as Partial<BackupFile> | null;
  if (!f || f.app !== 'vizitai' || typeof f.schemaVersion !== 'number' ||
      !Array.isArray(f.clients) || !Array.isArray(f.appointments) || !Array.isArray(f.services) || !Array.isArray(f.settings)) {
    throw new BackupError('format');
  }
  if (f.schemaVersion > SCHEMA_VERSION) throw new BackupError('newer');
  return f as BackupFile;
}

export async function importData(db: VizitaiDB, f: BackupFile): Promise<void> {
  await db.transaction('rw', db.clients, db.appointments, db.services, db.settings, async () => {
    await Promise.all([db.clients.clear(), db.appointments.clear(), db.services.clear(), db.settings.clear()]);
    await db.clients.bulkAdd(f.clients);
    await db.appointments.bulkAdd(f.appointments);
    await db.services.bulkAdd(f.services);
    await db.settings.bulkAdd(f.settings);
  });
}

export function backupFileName(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `vizitai-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export async function shareBackup(json: string, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
```
Settings import/validation: if a file has `schemaVersion` lower than current, a future migration step would go in `parseBackup`; none needed while `SCHEMA_VERSION === 1`.

- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test` → PASS.

- [ ] **Step 5: Commit, push, PR**
```bash
git add -A && git commit -m "feat: add JSON backup export, import and share"
git push -u origin m1-data
gh pr create --title "M1: data layer" --body "Implements M1: Dexie schema v1, seed, repo, overlap, backup. Assumption: personal entries are 60 min for overlap; seed lengths 45/90/120/120/60/30.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
