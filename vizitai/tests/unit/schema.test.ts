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
      version: 3,
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
    expect(mins).toEqual({ s1: 15, s2: 15, s3: 15, s4: 20, s5: 60 });
    db.close();
  });
});
