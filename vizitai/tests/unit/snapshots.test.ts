import { describe, it, expect } from 'vitest';
import { VizitaiDB } from '../../src/db/db';
import { ensureSeed } from '../../src/db/seed';
import { createRepo } from '../../src/db/repo';
import { BackupsDB, createBackups } from '../../src/db/backups';
import { exportData, importData, parseBackup } from '../../src/logic/backup';
import { backupDue, countsOf, fingerprint, stableStringify } from '../../src/logic/snapshots';

async function books() {
  const db = new VizitaiDB(`snap-${crypto.randomUUID()}`);
  await ensureSeed(db);
  const repo = createRepo(db);
  const s = (await repo.listServices(true))[0]!;
  await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
  return { db, repo, s };
}
const backupsFor = () => createBackups(new BackupsDB(`bk-${crypto.randomUUID()}`));

describe('fingerprint: what the books ARE, not when they were exported', () => {
  it('does not depend on key order, record order, the export time, or what only describes this phone', async () => {
    const { db } = await books();
    const a = await exportData(db);
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    b.exportedAt = '2030-01-01T00:00:00Z';
    b.clients.reverse(); b.appointments.reverse(); b.services.reverse();
    b.settings = b.settings.map((s) => ({ ...s, lastBackupAt: '2026-10-14T09:00:00Z', persistGranted: true }));
    b.appointments = b.appointments.map((x) => Object.fromEntries(Object.entries(x).reverse())) as typeof b.appointments;
    expect(fingerprint(b)).toBe(fingerprint(a));
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
  });
  it('changes with any real change: a visit, an amount, a client name, a service, a setting', async () => {
    const { db, repo, s } = await books();
    const seen = new Set([fingerprint(await exportData(db))]);
    const changes: (() => Promise<unknown>)[] = [
      async () => repo.createAppointment({ kind: 'client', name: 'Rasa', serviceId: s.id, start: '2026-10-15T10:00' }),
      async () => repo.setAmount((await db.appointments.toArray())[0]!.id, 4500),
      async () => repo.updateClient((await db.clients.toArray())[0]!.id, { phone: '+370 600 00000' }),
      async () => repo.updateService(s.id, { minutes: 60 }),
      async () => repo.updateSettings({ dayEnd: '19:00' }),
    ];
    for (const c of changes) { await c(); const fp = fingerprint(await exportData(db)); expect(seen.has(fp)).toBe(false); seen.add(fp); }
  });
  it('is the same after an export and an import', async () => {
    const { db } = await books();
    const f = await exportData(db);
    const other = new VizitaiDB(`snap2-${crypto.randomUUID()}`);
    await ensureSeed(other);
    await importData(other, parseBackup(JSON.stringify(f)));
    expect(fingerprint(await exportData(other))).toBe(fingerprint(f));
  });
});

describe('copies kept in the app', () => {
  it('keeps the last 3 exports, and exporting unchanged data keeps one copy and only moves its time', async () => {
    const { db, repo, s } = await books();
    const b = backupsFor();
    const save = async (at: string) => { const f = await exportData(db); return b.save('export', f, JSON.stringify(f), at); };
    const first = await save('2026-10-01T10:00:00Z');
    expect(first.created).toBe(true);
    const again = await save('2026-10-02T10:00:00Z'); // nothing changed
    expect(again.created).toBe(false);
    expect((await b.list('export')).map((x) => x.at)).toEqual(['2026-10-02T10:00:00Z']);
    for (let i = 0; i < 4; i++) { await repo.createAppointment({ kind: 'client', name: `K${i}`, serviceId: s.id, start: `2026-10-${20 + i}T10:00` }); await save(`2026-10-1${i + 3}T10:00:00Z`); }
    const list = await b.list('export');
    expect(list).toHaveLength(3);
    expect(list[0]!.at).toBe('2026-10-16T10:00:00Z'); // the newest first
    expect(list[0]!.counts.clients).toBe(5);
  });
  it('an automatic copy is not taken when any copy already holds these books', async () => {
    const { db } = await books();
    const b = backupsFor();
    const f = await exportData(db), json = JSON.stringify(f);
    await b.save('export', f, json, '2026-10-01T10:00:00Z');
    expect((await b.save('auto', f, json, '2026-10-02T10:00:00Z')).created).toBe(false);
    expect(await b.list('auto')).toHaveLength(0);
  });
  it('only the last safety copy is kept', async () => {
    const { db, repo, s } = await books();
    const b = backupsFor();
    const f1 = await exportData(db); await b.save('safety', f1, JSON.stringify(f1), '2026-10-01T10:00:00Z');
    await repo.createAppointment({ kind: 'client', name: 'Zita', serviceId: s.id, start: '2026-10-16T10:00' });
    const f2 = await exportData(db); await b.save('safety', f2, JSON.stringify(f2), '2026-10-02T10:00:00Z');
    const list = await b.list('safety');
    expect(list).toHaveLength(1);
    expect(list[0]!.fp).toBe(fingerprint(f2));
    expect(countsOf(parseBackup(list[0]!.json))).toEqual({ clients: 2, visits: 2 });
  });
});

describe('when a backup is due', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  it('never when there is no data, or when the books are exactly what the last export holds', () => {
    expect(backupDue(null, false, false, now)).toBe(false);
    expect(backupDue(null, true, true, now)).toBe(false);
    expect(backupDue('2026-01-01T00:00:00Z', true, true, now)).toBe(false); // long ago, but nothing has changed since
  });
  it('when there is data that was never exported, or changed and the last export is over a week old', () => {
    expect(backupDue(null, true, false, now)).toBe(true);
    expect(backupDue('2026-10-07T11:59:59Z', true, false, now)).toBe(true);
    expect(backupDue('2026-10-08T12:00:01Z', true, false, now)).toBe(false);
  });
});
