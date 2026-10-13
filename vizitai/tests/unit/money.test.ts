import { beforeEach, describe, expect, it } from 'vitest';
import { VizitaiDB } from '../../src/db/db';
import { createRepo } from '../../src/db/repo';
import { ensureSeed } from '../../src/db/seed';
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
  it('start empty: no templates, she creates them in Settings', async () => {
    // (the setup above added four of her own; a fresh install has none)
    const fresh = new VizitaiDB(`t-${crypto.randomUUID()}`);
    await ensureSeed(fresh);
    expect(await fresh.options.count()).toBe(0);
    await ensureSeed(db);
    expect(await db.options.count()).toBe(4);
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
    expect(file.options).toHaveLength(5);
    await importData(db, parseBackup(JSON.stringify(file)));
    expect(await db.options.count()).toBe(5);
    const old = { ...file }; delete old.options;
    await importData(db, parseBackup(JSON.stringify(old)));
    expect(await db.options.count()).toBe(0);
  });
});
