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
