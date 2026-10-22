import { beforeEach, describe, expect, it } from 'vitest';
import { VizitaiDB } from '../../src/db/db';
import { createRepo } from '../../src/db/repo';
import { ensureSeed } from '../../src/db/seed';
import { defaultPersonalNames } from '../../src/i18n/lt';
import { exportData, importData, parseBackup } from '../../src/logic/backup';

let db: VizitaiDB;
let repo: ReturnType<typeof createRepo>;
beforeEach(async () => {
  db = new VizitaiDB(`t-${crypto.randomUUID()}`);
  await ensureSeed(db);
  repo = createRepo(db);
  for (const n of ['Pietūs', 'Gydytojas']) await repo.addOption('personal', n);
  for (const n of ['Medžiagos', 'Nuoma']) await repo.addOption('expense', n);
});

describe('her own choices', () => {
  it('Asmeninis starts with common words (half an hour each); expenses start empty and she creates them', async () => {
    // (the setup above added four of her own on top; a fresh install has just the words)
    const fresh = new VizitaiDB(`t-${crypto.randomUUID()}`);
    await ensureSeed(fresh);
    const personal = (await fresh.options.toArray()).filter((o) => o.group === 'personal').sort((a, b) => a.order - b.order);
    expect(personal.map((o) => o.name)).toEqual(defaultPersonalNames);
    expect(personal.map((o) => o.name)).toEqual(expect.arrayContaining(['Psichologas', 'Psichiatras / psichiatrė', 'Neurologas / neurologė', 'Daktaras']));
    expect(personal.every((o) => o.minutes === 30)).toBe(true);
    expect((await fresh.options.toArray()).filter((o) => o.group === 'expense')).toHaveLength(0);
    await ensureSeed(fresh);
    expect(await fresh.options.count()).toBe(defaultPersonalNames.length); // seeded once
  });
  it('can be added, renamed (a blank name is ignored), deleted and restored', async () => {
    const o = await repo.addOption('expense', '  Kava  ');
    expect(o.name).toBe('Kava');
    await repo.renameOption(o.id, '   ');
    await repo.renameOption(o.id, 'Arbata');
    expect((await repo.listOptions('expense')).at(-1)?.name).toBe('Arbata');
    const gone = await repo.deleteOption(o.id);
    expect((await repo.listOptions('expense')).some((x) => x.id === o.id)).toBe(false);
    await repo.restoreOption(gone!);
    expect((await repo.listOptions('expense')).some((x) => x.id === o.id)).toBe(true);
  });
  it('deleting one never changes entries already made from it', async () => {
    const [o] = await repo.listOptions('personal');
    const a = await repo.createAppointment({ kind: 'personal', title: o.name, optionId: o.id, start: '2026-10-14T12:00' });
    await repo.deleteOption(o.id);
    expect((await repo.entriesBetween('2026-10-14', '2026-10-15'))[0].label).toBe(a.title);
  });
});

describe('expenses and the balance', () => {
  const svc = async () => (await repo.listServices(true))[0].id;
  it('the balance is the amounts of visits minus the expenses', async () => {
    const v = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: await svc(), start: '2026-10-14T09:00' });
    await repo.setAmount(v.id, 12000);
    const [o] = await repo.listOptions('expense');
    await repo.createAppointment({ kind: 'expense', title: o.name, optionId: o.id, amountCents: 2550, start: '2026-10-14T10:00' });
    expect(await repo.balance()).toEqual({ inCents: 12000, outCents: 2550, balanceCents: 9450 });
  });
  it('can go below zero, and cancelled expenses and visits do not count', async () => {
    const [o] = await repo.listOptions('expense');
    const e = await repo.createAppointment({ kind: 'expense', title: o.name, optionId: o.id, amountCents: 5000, start: '2026-10-14T10:00' });
    expect((await repo.balance()).balanceCents).toBe(-5000);
    await repo.cancelAppointment(e.id, null);
    expect((await repo.balance()).balanceCents).toBe(0);
    const v = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: await svc(), start: '2026-10-14T09:00' });
    await repo.setAmount(v.id, 3000);
    await repo.cancelAppointment(v.id, null);
    expect((await repo.balance()).inCents).toBe(0);
  });
  it('an expense needs a title and a valid amount, and never overlaps a visit', async () => {
    await expect(repo.createAppointment({ kind: 'expense', title: 'Nuoma', start: '2026-10-14T10:00' })).rejects.toThrow('bad-amount');
    await expect(repo.createAppointment({ kind: 'expense', title: '', amountCents: 100, start: '2026-10-14T10:00' })).rejects.toThrow('empty-title');
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: await svc(), start: '2026-10-14T10:00' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:00', kind: 'expense', serviceId: null })).toBeUndefined();
    const e = await repo.createAppointment({ kind: 'expense', title: 'Nuoma', amountCents: 100, start: '2026-10-14T10:00' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:00', kind: 'client', serviceId: await svc() })).toMatchObject({ label: 'Ona' });
    expect(e.kind).toBe('expense');
  });
});

describe('backup', () => {
  it('keeps her choices, and an older file without them has none', async () => {
    await repo.addOption('personal', 'Sporto salė');
    const file = await exportData(db);
    const n = await db.options.count();
    expect(file.options).toHaveLength(n);
    await importData(db, parseBackup(JSON.stringify(file)));
    expect(await db.options.count()).toBe(n);
    const old = { ...file }; delete old.options;
    await importData(db, parseBackup(JSON.stringify(old)));
    expect(await db.options.count()).toBe(0);
  });
});

describe('changing an amount leaves a trail', () => {
  it('logs a change of a confirmed amount, newest last, and not the first amount', async () => {
    const [svc] = await repo.listServices(true);
    const v = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: svc.id, start: '2026-10-14T09:00' });
    await repo.setAmount(v.id, 4000);
    expect((await repo.getAppointment(v.id))!.amountLog).toBeUndefined();
    await repo.setAmount(v.id, 4000); // the same amount: nothing to log
    await repo.setAmount(v.id, 5000);
    await repo.setAmount(v.id, null);
    const log = (await repo.getAppointment(v.id))!.amountLog!;
    expect(log.map((l) => [l.from, l.to])).toEqual([[4000, 5000], [5000, null]]);
    expect(Date.parse(log[0].at)).toBeLessThan(Date.parse(log[1].at));
  });
  it('an undo (the snapshot from before) takes the log line with it', async () => {
    const [svc] = await repo.listServices(true);
    const v = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: svc.id, start: '2026-10-14T09:00' });
    await repo.setAmount(v.id, 4000);
    const { before } = await repo.setAmount(v.id, null);
    await repo.putSnapshot(before);
    const back = (await repo.getAppointment(v.id))!;
    expect(back.amountCents).toBe(4000);
    expect(back.amountLog).toBeUndefined();
  });
});

describe('summary of a day, week and month', () => {
  it('covers exactly its dates: a week starts on Monday, a month is the calendar month', async () => {
    const [svc] = await repo.listServices(true);
    const mk = async (start: string, cents: number) => { const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: svc.id, start }); await repo.setAmount(a.id, cents); };
    await mk('2026-10-11T09:00', 100); // Sunday before the week
    await mk('2026-10-12T09:00', 200); // Monday
    await mk('2026-10-18T09:00', 400); // Sunday
    await mk('2026-10-19T09:00', 800); // next Monday
    await mk('2026-11-01T09:00', 1600);
    const now = '2026-10-20T12:00';
    expect((await repo.summary('day', '2026-10-18', now)).inCents).toBe(400);
    expect((await repo.summary('week', '2026-10-14', now)).inCents).toBe(600);
    expect((await repo.summary('month', '2026-10-14', now)).inCents).toBe(100 + 200 + 400 + 800);
  });
});

describe('Asmeninis: half an hour, with a colour of its own', () => {
  it('takes the length of its choice and is teal, not grey', async () => {
    const [p] = await repo.listOptions('personal');
    await repo.updateOption(p.id, { minutes: 90 });
    const a = await repo.createAppointment({ kind: 'personal', title: p.name, optionId: p.id, minutes: 90, start: '2026-10-14T10:00' });
    const b = await repo.createAppointment({ kind: 'personal', title: 'Kita', start: '2026-10-14T13:00' });
    const [e1, e2] = await repo.entriesBetween('2026-10-14', '2026-10-15');
    expect(e1.appt.id).toBe(a.id);
    expect(e1.minutes).toBe(90);
    expect(e2.appt.id).toBe(b.id);
    expect(e2.minutes).toBe(30); // no length given: the default
    expect(e1.color).toBe('teal');
  });
  it('blocks its whole length', async () => {
    await repo.createAppointment({ kind: 'personal', title: 'Daktaras', minutes: 60, start: '2026-10-14T10:00' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T10:45', kind: 'personal', serviceId: null })).toMatchObject({ label: 'Daktaras' });
    expect(await repo.findOverlapFor({ start: '2026-10-14T11:00', kind: 'personal', serviceId: null })).toBeUndefined();
  });
});
