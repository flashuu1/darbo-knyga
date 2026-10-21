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
  it('seeds every service with the 15-minute default length', async () => {
    expect((await repo.listServices()).map((s) => s.minutes)).toEqual([15, 15, 15, 15, 15, 240, 15]);
  });
  it('creates seven services and default settings once', async () => {
    expect((await repo.listServices()).map((s) => s.name)).toEqual(['Kirpimas', 'Dažymas', 'Kirpimas ir dažymas', 'Sruogelės', 'Šukuosena', 'Vestuvės', 'Kita']);
    await ensureSeed(db);
    expect(await db.services.count()).toBe(7);
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
  it('keeps the exact minute she picked (no grid) as wall-clock text', async () => {
    const s = await firstService();
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-25T10:07' });
    expect(a.start).toBe('2026-10-25T10:07');
    const moved = await repo.moveAppointment(a.id, '2026-10-26T14:53');
    expect(moved.after.start).toBe('2026-10-26T14:53');
  });
  it('rejects a malformed start', async () => {
    const s = await firstService();
    await expect(repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-25 10:07' })).rejects.toThrow();
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
    const s = await firstService(); // Kirpimas, 15 min by default: only the same start clashes
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:00', kind: 'client', serviceId: s.id }))
      .toEqual({ label: 'Ona', serviceName: 'Kirpimas' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:15', kind: 'client', serviceId: s.id })).toBeUndefined();
    expect(await repo.findOverlapFor({ start: '2026-10-14T09:45', kind: 'client', serviceId: s.id })).toBeUndefined();
  });
  it('uses a longer stored length when the service has one', async () => {
    const s = await firstService();
    await repo.updateService(s.id, { minutes: 60 });
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:45', kind: 'client', serviceId: s.id })).toEqual({ label: 'Ona', serviceName: 'Kirpimas' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T11:00', kind: 'client', serviceId: s.id })).toBeUndefined();
  });
  it('excludes the entry being moved', async () => {
    const s = await firstService();
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:00', kind: 'client', serviceId: s.id, excludeId: a.id })).toBeUndefined();
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
    expect(e[0]).toMatchObject({ minutes: 15, color: 'blue' });
    expect(e[1].minutes).toBe(15);
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
    expect(await repo.defaultStartFor('2026-10-14', '2026-10-14T10:00')).toBe('2026-10-14T10:15');
  });
  it('keeps the proposed start inside the working day', async () => {
    const [, , s3] = await repo.listServices(true);
    await repo.updateService(s3.id, { minutes: 120 });
    expect(await repo.defaultStartFor('2026-10-14', '2026-10-14T06:00')).toBe('2026-10-14T08:00');
    expect(await repo.defaultStartFor('2026-10-14', '2026-10-14T21:05')).toBe('2026-10-15T08:00');
    expect(await repo.defaultStartFor('2026-10-14', '2026-10-14T23:50')).toBe('2026-10-15T08:00');
    await repo.createAppointment({ kind: 'client', name: 'A', serviceId: s3.id, start: '2026-10-14T19:00' });
    expect(await repo.defaultStartFor('2026-10-14', '2026-10-14T19:50')).toBe('2026-10-15T08:00');
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
    expect(await db.services.count()).toBe(7);
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
  it('trims a renamed service and ignores an empty name while applying other fields', async () => {
    const s = await firstService();
    await repo.updateService(s.id, { name: '  Nauja   forma ' });
    expect((await db.services.get(s.id))?.name).toBe('Nauja forma');
    await repo.updateService(s.id, { name: '   ', minutes: 30 });
    expect(await db.services.get(s.id)).toMatchObject({ name: 'Nauja forma', minutes: 30 });
  });
  it('reorders services', async () => {
    const [s1, s2] = await repo.listServices();
    await repo.moveService(s2.id, -1);
    const after = await repo.listServices();
    expect(after[0].id).toBe(s2.id);
    expect(after[1].id).toBe(s1.id);
  });
});

describe('updateClient', () => {
  it('ignores a name owned by another client or empty, but allows case-only changes', async () => {
    const ona = await repo.matchOrCreateClient('Ona');
    const zita = await repo.matchOrCreateClient('Zita');
    await repo.updateClient(ona.id, { name: 'ZITA' });
    expect((await repo.getClient(ona.id))?.name).toBe('Ona');
    await repo.updateClient(ona.id, { name: '   ' });
    expect((await repo.getClient(ona.id))?.name).toBe('Ona');
    await repo.updateClient(zita.id, { name: 'ZITA', phone: ' 123 ' });
    expect(await repo.getClient(zita.id)).toMatchObject({ name: 'ZITA', nameKey: 'zita', phone: '123' });
  });
});

describe('name suggestions (they have to stay useful as the client list grows)', () => {
  it('ranks names that start with the text first, then later words, then the busiest client', async () => {
    const s = (await repo.listServices(true))[0];
    const mk = async (name: string, n = 1) => { for (let i = 0; i < n; i++) await repo.createAppointment({ kind: 'client', name, serviceId: s.id, start: `2026-09-0${i + 1}T10:00` }); };
    await mk('Ona Jonaitė'); // later word starts with "jon"
    await mk('Jonas Petraitis', 1);
    await mk('Jonė Kazlauskienė', 3); // most visits among the prefix matches
    await mk('Marijona Šimkutė'); // only contains "jon"
    expect((await repo.searchClients('jon')).map((c) => c.name)).toEqual(['Jonė Kazlauskienė', 'Jonas Petraitis', 'Ona Jonaitė', 'Marijona Šimkutė']);
  });
  it('matches without diacritics and from two letters; one letter only matches the start of a word', async () => {
    const s = (await repo.listServices(true))[0];
    await repo.createAppointment({ kind: 'client', name: 'Žydrūnė Banienė', serviceId: s.id, start: '2026-09-01T10:00' });
    await repo.createAppointment({ kind: 'client', name: 'Rasa Žilienė', serviceId: s.id, start: '2026-09-02T10:00' });
    expect((await repo.searchClients('zy')).map((c) => c.name)).toEqual(['Žydrūnė Banienė']);
    expect((await repo.searchClients('zi')).map((c) => c.name)).toEqual(['Rasa Žilienė']);
    expect((await repo.searchClients('e')).map((c) => c.name)).toEqual([]); // 'e' is not the start of any word
    expect((await repo.searchClients('b')).map((c) => c.name)).toEqual(['Žydrūnė Banienė']);
  });
  it('returns at most 6 and works with a few hundred clients', async () => {
    const s = (await repo.listServices(true))[0];
    for (let i = 0; i < 300; i++) await repo.matchOrCreateClient(`Klientas ${i}`);
    await repo.createAppointment({ kind: 'client', name: 'Klientas 7', serviceId: s.id, start: '2026-09-01T10:00' });
    const r = await repo.searchClients('kli');
    expect(r).toHaveLength(6);
    expect(r[0].name).toBe('Klientas 7'); // the one she actually books comes first
  });
});

describe('contacts list: pending payment first, paid this month, then the next visit', () => {
  const NOW = '2026-10-14T12:00';
  it('orders, labels and expires the paid status at the end of the month', async () => {
    const s = (await repo.listServices(true))[0];
    const book = async (name: string, start: string, amount?: number) => {
      const a = await repo.createAppointment({ kind: 'client', name, serviceId: s.id, start });
      if (amount !== undefined) await repo.setAmount(a.id, amount);
      return a;
    };
    await book('Aaa Laukia', '2026-10-14T09:00'); // visit passed, no amount: pending
    await book('Bbb Seniai', '2026-10-10T09:00'); // pending for longer: before Aaa
    await book('Ccc Sumokėjo', '2026-10-12T10:00', 4500);
    await book('Ccc Sumokėjo', '2026-10-13T10:00', 1500); // sum 60,00 this month
    await book('Ccc Sumokėjo', '2026-10-30T10:00'); // and a visit coming up
    await book('Ddd Praeitą mėnesį', '2026-09-28T10:00', 5000); // paid last month: no longer shown as paid
    await book('Eee Netrukus', '2026-10-20T10:00');
    await book('Fff Vėliau', '2026-11-05T10:00');
    await repo.matchOrCreateClient('Ggg Tuščias');
    const rows = await repo.listClients(NOW);
    expect(rows.map((r) => r.client.name)).toEqual(['Bbb Seniai', 'Aaa Laukia', 'Ccc Sumokėjo', 'Eee Netrukus', 'Fff Vėliau', 'Ddd Praeitą mėnesį', 'Ggg Tuščias']);
    const by = Object.fromEntries(rows.map((r) => [r.client.name, r]));
    expect(by['Bbb Seniai'].pending?.start).toBe('2026-10-10T09:00');
    expect(by['Ccc Sumokėjo']).toMatchObject({ pending: null, paidCents: 6000, nextVisit: '2026-10-30T10:00' });
    expect(by['Ddd Praeitą mėnesį'].paidCents).toBe(0);
    expect(by['Ggg Tuščias']).toMatchObject({ pending: null, paidCents: 0, nextVisit: null, lastVisit: null });
    // the paid status ends with the month: on 1 November the same data reads differently
    const nov = await repo.listClients('2026-11-01T08:00');
    expect(nov.find((r) => r.client.name === 'Ccc Sumokėjo')!.paidCents).toBe(0);
  });
  it('ignores cancelled and no-show visits', async () => {
    const s = (await repo.listServices(true))[0];
    const a = await repo.createAppointment({ kind: 'client', name: 'Hhh', serviceId: s.id, start: '2026-10-10T09:00' });
    await repo.cancelAppointment(a.id, null);
    const b = await repo.createAppointment({ kind: 'client', name: 'Iii', serviceId: s.id, start: '2026-10-10T09:00' });
    await repo.markNoShow(b.id);
    const rows = await repo.listClients(NOW);
    expect(rows.every((r) => r.pending === null && r.paidCents === 0 && r.nextVisit === null)).toBe(true);
  });
});

describe('cancelled visits only stay for a week', () => {
  const day = 86_400_000;
  it('removes cancelled visits older than 7 days and keeps newer ones, bookings and no-shows', async () => {
    const s = (await repo.listServices(true))[0];
    const mk = (n: string, start: string) => repo.createAppointment({ kind: 'client', name: n, serviceId: s.id, start });
    const old = await mk('Sena', '2026-10-01T10:00');
    const recent = await mk('Šviežia', '2026-10-02T10:00');
    const booked = await mk('Užregistruota', '2026-10-03T10:00');
    const noshow = await mk('Neatvyko', '2026-10-04T10:00');
    await repo.cancelAppointment(old.id, null);
    await repo.cancelAppointment(recent.id, null);
    await repo.markNoShow(noshow.id);
    const now = new Date();
    await db.appointments.update(old.id, { cancelledAt: new Date(now.getTime() - 8 * day).toISOString() });
    await db.appointments.update(recent.id, { cancelledAt: new Date(now.getTime() - 6 * day).toISOString() });
    expect(await repo.purgeCancelled(now)).toBe(1);
    expect(await db.appointments.get(old.id)).toBeUndefined();
    expect(await db.appointments.get(recent.id)).toBeDefined();
    expect(await db.appointments.get(booked.id)).toBeDefined();
    expect(await db.appointments.get(noshow.id)).toBeDefined();
    expect(await repo.purgeCancelled(now)).toBe(0);
  });
  it('a week later the recent one goes too, and the client stays', async () => {
    const s = (await repo.listServices(true))[0];
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-02T10:00' });
    await repo.cancelAppointment(a.id, null);
    expect(await repo.purgeCancelled(new Date(Date.now() + 7.1 * day))).toBe(1);
    expect(await db.clients.count()).toBe(1);
  });
});
