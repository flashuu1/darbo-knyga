import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { VizitaiDB } from '../../src/db/db';
import { ensureSeed } from '../../src/db/seed';
import { createRepo } from '../../src/db/repo';
import { exportData, importData, parseBackup } from '../../src/logic/backup';
import { buildAnalytics } from '../../src/logic/analytics';
import { fillDemo } from '../support/demo';

// `DEMO_OUT=path/to/file.json npx vitest run tests/unit/demo-backup.test.ts` also writes the file for a test phone.
const NOW = process.env.DEMO_NOW ?? '2026-11-03T10:24';

async function demo() {
  const db = new VizitaiDB(`demo-${crypto.randomUUID()}`);
  await ensureSeed(db);
  const repo = createRepo(db);
  await fillDemo(db, repo, NOW);
  return { db, repo };
}

describe('the demo books for a test phone', () => {
  it('has the shape the Klientai tab is built to show, and survives export and import', async () => {
    const { db, repo } = await demo();
    const rows = await repo.listClients(NOW);
    expect(rows).toHaveLength(52);
    expect(rows.filter((r) => r.pending)).toHaveLength(5);
    expect(rows.filter((r) => r.paid).length).toBeGreaterThanOrEqual(7);
    expect(rows.filter((r) => r.nextVisit).length).toBeGreaterThanOrEqual(15);
    expect(rows.slice(0, 5).every((r) => r.pending)).toBe(true); // waiting for an amount comes first
    const a = buildAnalytics(await repo.analyticsInput(NOW));
    expect(a.visits.reduce((x, y) => x + y, 0)).toBeGreaterThan(300);
    expect(a.util.slice(-6).every((u) => u > 0 && u <= 100)).toBe(true);
    expect(a.gaps.length).toBeGreaterThan(0);
    expect(a.lostCents.some((c) => c > 0)).toBe(true);

    const file = await exportData(db);
    const json = JSON.stringify(file);
    if (process.env.DEMO_OUT) { mkdirSync(dirname(process.env.DEMO_OUT), { recursive: true }); writeFileSync(process.env.DEMO_OUT, json); }
    const db2 = new VizitaiDB(`demo2-${crypto.randomUUID()}`);
    await ensureSeed(db2);
    await importData(db2, parseBackup(json));
    expect(await db2.clients.count()).toBe(52);
    expect(await db2.appointments.count()).toBe(file.appointments.length);
  });
});
