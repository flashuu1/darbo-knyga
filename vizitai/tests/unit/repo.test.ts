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
