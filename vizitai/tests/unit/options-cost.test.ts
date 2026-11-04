import { describe, it, expect } from 'vitest';
import { VizitaiDB } from '../../src/db/db';
import { ensureSeed } from '../../src/db/seed';
import { createRepo } from '../../src/db/repo';
import { exportData, importData, parseBackup } from '../../src/logic/backup';
import { fingerprint } from '../../src/logic/snapshots';

async function fresh() {
  const db = new VizitaiDB(`opt-${crypto.randomUUID()}`);
  await ensureSeed(db);
  return { db, repo: createRepo(db) };
}

describe('a fixed amount on an expense kind', () => {
  it('starts without one; only a positive whole number of cents is kept; null removes it', async () => {
    const { repo } = await fresh();
    const rent = await repo.addOption('expense', 'Nuoma');
    expect((await repo.listOptions('expense'))[0]!.costCents).toBeUndefined();
    await repo.updateOption(rent.id, { costCents: 45000 });
    expect((await repo.listOptions('expense'))[0]!.costCents).toBe(45000);
    for (const bad of [0, -5, 12.5, Number.NaN, 100_000 * 100 + 1]) {
      await repo.updateOption(rent.id, { costCents: bad });
      expect((await repo.listOptions('expense'))[0]!.costCents).toBe(45000); // ignored
    }
    await repo.updateOption(rent.id, { costCents: null });
    const o = (await repo.listOptions('expense'))[0]!;
    expect(o.costCents).toBeUndefined();
    expect('costCents' in o).toBe(false); // really gone, not just undefined
  });

  it('changing the amount or the length leaves the other kinds and the other field alone', async () => {
    const { repo } = await fresh();
    const a = await repo.addOption('expense', 'Nuoma'), b = await repo.addOption('expense', 'Medžiagos');
    await repo.updateOption(a.id, { costCents: 45000 });
    const p = await repo.addOption('personal', 'Pietūs');
    await repo.updateOption(p.id, { minutes: 90 });
    expect((await repo.listOptions('expense')).find((o) => o.id === b.id)!.costCents).toBeUndefined();
    expect((await repo.listOptions('personal')).find((o) => o.id === p.id)!.minutes).toBe(90);
    expect((await repo.listOptions('personal')).find((o) => o.id === p.id)!.costCents).toBeUndefined();
  });

  it('is kept by the backup file, and an older file (without it) still loads', async () => {
    const { db, repo } = await fresh();
    const rent = await repo.addOption('expense', 'Nuoma');
    await repo.updateOption(rent.id, { costCents: 45000 });
    const f = await exportData(db);
    const other = new VizitaiDB(`opt2-${crypto.randomUUID()}`);
    await ensureSeed(other);
    await importData(other, parseBackup(JSON.stringify(f)));
    expect((await createRepo(other).listOptions('expense'))[0]!.costCents).toBe(45000);
    expect(fingerprint(await exportData(other))).toBe(fingerprint(f));
    const old = JSON.parse(JSON.stringify(f)) as typeof f;
    for (const o of old.options ?? []) delete o.costCents;
    await importData(other, parseBackup(JSON.stringify(old)));
    expect((await createRepo(other).listOptions('expense'))[0]!.costCents).toBeUndefined();
  });
});

describe('putting her own lists in the order she dragged them', () => {
  it('sets the order of a list of choices, in its own group only; ids left out keep their relative order at the end', async () => {
    const { repo } = await fresh();
    const a = await repo.addOption('expense', 'A'), b = await repo.addOption('expense', 'B'), c = await repo.addOption('expense', 'C');
    await repo.addOption('personal', 'Z');
    const before = (await repo.listOptions('personal')).map((o) => o.name);
    await repo.reorderOptions('expense', [c.id, a.id, b.id]);
    expect((await repo.listOptions('expense')).map((o) => o.name)).toEqual(['C', 'A', 'B']);
    await repo.reorderOptions('expense', [b.id]);
    expect((await repo.listOptions('expense')).map((o) => o.name)).toEqual(['B', 'C', 'A']);
    await repo.reorderOptions('expense', ['nope', a.id]);
    expect((await repo.listOptions('expense')).map((o) => o.name)).toEqual(['A', 'B', 'C']);
    expect((await repo.listOptions('personal')).map((o) => o.name)).toEqual(before);
  });

  it('sets the order of the services', async () => {
    const { repo } = await fresh();
    const all = await repo.listServices();
    const ids = all.map((s) => s.id);
    await repo.reorderServices([...ids].reverse());
    expect((await repo.listServices()).map((s) => s.id)).toEqual([...ids].reverse());
    await repo.reorderServices([ids[2]!]);
    expect((await repo.listServices())[0]!.id).toBe(ids[2]);
    expect((await repo.listServices()).length).toBe(ids.length); // nothing was lost
  });

  it('a removed choice comes back where it was (Anuliuoti)', async () => {
    const { repo } = await fresh();
    const a = await repo.addOption('expense', 'A'), b = await repo.addOption('expense', 'B');
    await repo.addOption('expense', 'C');
    const gone = await repo.deleteOption(b.id);
    expect((await repo.listOptions('expense')).map((o) => o.name)).toEqual(['A', 'C']);
    await repo.restoreOption(gone!);
    expect((await repo.listOptions('expense')).map((o) => o.name)).toEqual(['A', 'B', 'C']);
    expect(a.id).toBeTruthy();
  });
});
