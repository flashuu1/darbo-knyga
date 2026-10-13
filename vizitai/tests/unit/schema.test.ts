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
