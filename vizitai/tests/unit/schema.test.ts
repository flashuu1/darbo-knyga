import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { VizitaiDB } from '../../src/db/db';
import { versions, SCHEMA_VERSION } from '../../src/db/schema';

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
      version: 6,
      stores: { appointments: 'id, clientId, start, status, createdAt' },
      upgrade: (tx) => tx.table('appointments').toCollection().modify((a) => { a.createdAt = a.createdAt ?? 'migrated'; }),
    }]);
    await v2.open();
    expect(await v2.clients.count()).toBe(2);
    expect(await v2.appointments.count()).toBe(1);
    expect(await v2.services.count()).toBe(2);
    expect(await v2.settings.count()).toBe(1);
    expect(((await v2.appointments.get('a1')) as unknown as { createdAt: string }).createdAt).toBe('migrated');
    v2.close();
  });
});

describe('v2: every service defaults to 15 minutes', () => {
  it('turns the old built-in lengths into 15 and keeps lengths she chose herself', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    const name = `v2-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(versions[0].stores as Record<string, string>);
    await v1.table('services').bulkAdd([
      { id: 's1', name: 'Kirpimas', color: 'blue', minutes: 45, order: 0, active: true },
      { id: 's2', name: 'Dažymas', color: 'pink', minutes: 90, order: 1, active: true },
      { id: 's3', name: 'Šukuosena', color: 'green', minutes: 60, order: 2, active: true },
      { id: 's4', name: 'Kirpimas', color: 'blue', minutes: 20, order: 3, active: true }, // her own value: kept
      { id: 's5', name: 'Mano paslauga', color: 'gray', minutes: 60, order: 4, active: true }, // renamed: kept
    ]);
    v1.close();
    const db = new VizitaiDB(name);
    await db.open();
    const mins = Object.fromEntries((await db.services.toArray()).map((s) => [s.id, s.minutes]));
    expect(Object.fromEntries(Object.entries(mins).filter(([k]) => k.startsWith('s')))).toEqual({ s1: 15, s2: 15, s3: 15, s4: 20, s5: 60 });
    db.close();
  });
});

describe('v4: the example choices of version 3 are removed', () => {
  it('deletes options still carrying a template name and keeps her own', async () => {
    const name = `v4-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    for (const v of versions.filter((x) => x.version <= 3)) old.version(v.version).stores(v.stores as Record<string, string>);
    await old.table('options').bulkAdd([
      { id: 'o1', group: 'personal', name: 'Pietūs', order: 0 },
      { id: 'o2', group: 'expense', name: 'Nuoma', order: 0 },
      { id: 'o3', group: 'expense', name: 'Kavos aparatas', order: 1 },
    ]);
    old.close();
    const db = new VizitaiDB(name);
    await db.open();
    const ids = (await db.options.toArray()).map((o) => o.id);
    expect(ids).toContain('o3'); // her own stays
    expect(ids).not.toContain('o1'); // the examples go (v6 later adds the new common words under new ids)
    expect(ids).not.toContain('o2');
    db.close();
  });
});

describe('v5: Vestuvės joins the services', () => {
  const old = async (rows: { id: string; name: string; order: number }[]) => {
    const name = `v5-${crypto.randomUUID()}`;
    const d = new Dexie(name);
    for (const v of versions.filter((x) => x.version <= 4)) d.version(v.version).stores(v.stores as Record<string, string>);
    await d.table('services').bulkAdd(rows.map((r) => ({ ...r, color: 'blue', minutes: 15, active: true })));
    d.close();
    const db = new VizitaiDB(name);
    await db.open();
    return db;
  };
  it('is added once, long and floral, just before "Kita"', async () => {
    const db = await old([{ id: 'a', name: 'Kirpimas', order: 0 }, { id: 'k', name: 'Kita', order: 1 }]);
    const list = await db.services.orderBy('order').toArray();
    expect(list.map((s) => s.name)).toEqual(['Kirpimas', 'Vestuvės', 'Kita']);
    expect(list[1]).toMatchObject({ minutes: 240, floral: true, active: true });
    db.close();
  });
  it('is not added again when it is already there, and not to an empty database', async () => {
    const has = await old([{ id: 'a', name: 'Vestuvės', order: 0 }]);
    expect(await has.services.count()).toBe(1);
    has.close();
    const empty = await old([]);
    expect(await empty.services.count()).toBe(0);
    empty.close();
  });
});

describe('v6: Asmeninis starts with common words', () => {
  const old = async (rows: { id: string; group: string; name: string; order: number }[]) => {
    const name = `v6-${crypto.randomUUID()}`;
    const d = new Dexie(name);
    for (const v of versions.filter((x) => x.version <= 5)) d.version(v.version).stores(v.stores as Record<string, string>);
    await d.table('options').bulkAdd(rows);
    d.close();
    const db = new VizitaiDB(name);
    await db.open();
    return db;
  };
  it('are added once, half an hour each, after hers, without doubling a word she has', async () => {
    const db = await old([{ id: 'm', group: 'personal', name: 'psichologas', order: 0 }, { id: 'e', group: 'expense', name: 'Nuoma', order: 0 }]);
    const personal = (await db.options.toArray()).filter((o) => o.group === 'personal').sort((a, b) => a.order - b.order);
    expect(personal[0]!.id).toBe('m');
    expect(personal.filter((o) => o.name.toLowerCase() === 'psichologas')).toHaveLength(1);
    expect(personal.map((o) => o.name)).toContain('Neurologas / neurologė');
    expect(personal.slice(1).every((o) => o.minutes === 30)).toBe(true);
    expect((await db.options.toArray()).filter((o) => o.group === 'expense')).toHaveLength(1); // expenses are not touched
    db.close();
  });
});

describe('v7: Pertrauka and Vaikų reikalai are removed from the personal words', () => {
  it('deletes exactly those two among the personal choices and leaves everything else', async () => {
    const name = `v7-${crypto.randomUUID()}`;
    const d = new Dexie(name);
    for (const v of versions.filter((x) => x.version <= 6)) d.version(v.version).stores(v.stores as Record<string, string>);
    await d.table('options').bulkAdd([
      { id: 'a', group: 'personal', name: 'Pertrauka', order: 0 }, { id: 'b', group: 'personal', name: 'Vaikų reikalai', order: 1 },
      { id: 'c', group: 'personal', name: 'Daktaras', order: 2 }, { id: 'd', group: 'expense', name: 'Pertrauka', order: 0 },
    ]);
    d.close();
    const db = new VizitaiDB(name);
    await db.open();
    const ids = (await db.options.toArray()).map((o) => o.id).sort();
    expect(ids).toEqual(['c', 'd']);
    db.close();
  });
});
