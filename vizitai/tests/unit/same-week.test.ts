import { describe, expect, it } from 'vitest';
import { VizitaiDB } from '../../src/db/db';
import { ensureSeed } from '../../src/db/seed';
import { createRepo } from '../../src/db/repo';

async function books() {
  const db = new VizitaiDB(`wk-${crypto.randomUUID()}`);
  await ensureSeed(db);
  const repo = createRepo(db);
  const s = (await repo.listServices(true))[0]!;
  const visit = (name: string, start: string) => repo.createAppointment({ kind: 'client', name, serviceId: s.id, start });
  return { db, repo, visit };
}
const starts = (list: { appt: { start: string } }[]) => list.map((e) => e.appt.start).sort();

describe('the visits of one person in a week', () => {
  it('the week is Monday to Sunday of the date asked about: the Sunday before and the Monday after are not in it', async () => {
    const { repo, visit } = await books();
    for (const d of ['2026-10-11T10:00', '2026-10-12T09:00', '2026-10-15T10:00', '2026-10-18T20:00', '2026-10-19T09:00']) await visit('Ona Petraitė', d);
    const w = await repo.visitsInWeek('Ona Petraitė', '2026-10-16T14:00'); // a Friday
    expect(w.from).toBe('2026-10-12');
    expect(starts(w.mine)).toEqual(['2026-10-12T09:00', '2026-10-15T10:00', '2026-10-18T20:00']);
    expect((await repo.visitsInWeek('Ona Petraitė', '2026-10-12T08:00')).from).toBe('2026-10-12'); // the Monday itself
    expect((await repo.visitsInWeek('Ona Petraitė', '2026-10-18T08:00')).from).toBe('2026-10-12'); // the Sunday itself
  });
  it('the name is found the way a client is found: any case, with or without the Lithuanian letters', async () => {
    const { repo, visit } = await books();
    await visit('Ona Petraitė', '2026-10-15T10:00');
    for (const n of ['Ona Petraitė', 'ona petraite', 'ONA PETRAITĖ', '  Ona   Petraitė ']) expect((await repo.visitsInWeek(n, '2026-10-16T14:00')).mine).toHaveLength(1);
    expect((await repo.visitsInWeek('Ona', '2026-10-16T14:00')).mine).toHaveLength(0); // another name is another person
  });
  it('only booked visits of that person count: not other people, not cancelled visits, not no-shows, not her own entries', async () => {
    const { repo, visit, db } = await books();
    const a = await visit('Ona Petraitė', '2026-10-13T10:00'), b = await visit('Ona Petraitė', '2026-10-14T10:00'), keep = await visit('Ona Petraitė', '2026-10-15T10:00');
    await visit('Rasa Kazlauskienė', '2026-10-15T12:00');
    await repo.createAppointment({ kind: 'personal', title: 'Nedirbu', minutes: 60, start: '2026-10-16T10:00' });
    await db.appointments.update(a.id, { status: 'cancelled', cancelReason: 'client' });
    await db.appointments.update(b.id, { status: 'noshow' });
    const w = await repo.visitsInWeek('Ona Petraitė', '2026-10-16T14:00');
    expect(w.mine.map((e) => e.appt.id)).toEqual([keep.id]);
    expect(w.all.some((e) => e.appt.status !== 'booked')).toBe(false); // the rest of the week, for drawing it, is only what is booked
    expect(w.all.length).toBe(3); // Ona, Rasa, and the Nedirbu
  });
  it('one visit can be left out (the one a rebooking starts from)', async () => {
    const { repo, visit } = await books();
    const a = await visit('Ona Petraitė', '2026-10-14T08:00'), b = await visit('Ona Petraitė', '2026-10-15T10:00');
    expect((await repo.visitsInWeek('Ona Petraitė', '2026-10-16T14:00', a.id)).mine.map((e) => e.appt.id)).toEqual([b.id]);
  });
  it('a name nobody has is nobody', async () => {
    const { repo, visit } = await books();
    await visit('Ona Petraitė', '2026-10-15T10:00');
    expect((await repo.visitsInWeek('Nauja Klientė', '2026-10-16T14:00')).mine).toEqual([]);
  });
});
