import { describe, it, expect, beforeEach } from 'vitest';
import { VizitaiDB } from '../../src/db/db';
import { ensureSeed } from '../../src/db/seed';
import { createRepo } from '../../src/db/repo';
import { canHaveAmount, isAmountDue, isValidCents, MAX_AMOUNT_CENTS } from '../../src/logic/amount';
import { formatAmountInput, formatEuro, parseAmountInput } from '../../src/i18n/format';
import { exportData, importData, parseBackup } from '../../src/logic/backup';

const base = { kind: 'client', status: 'booked', start: '2026-10-14T10:00', amountCents: undefined } as const;

describe('isAmountDue', () => {
  it('is due exactly from the start time, and not before', () => {
    expect(isAmountDue(base, '2026-10-14T09:59')).toBe(false);
    expect(isAmountDue(base, '2026-10-14T10:00')).toBe(true);
    expect(isAmountDue(base, '2026-10-15T08:00')).toBe(true);
  });
  it('is not due once an amount exists (0 € counts as entered)', () => {
    expect(isAmountDue({ ...base, amountCents: 4500 }, '2026-10-14T11:00')).toBe(false);
    expect(isAmountDue({ ...base, amountCents: 0 }, '2026-10-14T11:00')).toBe(false);
    expect(isAmountDue({ ...base, amountCents: null }, '2026-10-14T11:00')).toBe(true);
  });
  it('is never due for no-shows, cancelled visits or personal entries', () => {
    for (const o of [{ status: 'noshow' }, { status: 'cancelled' }, { kind: 'personal' }] as const) {
      expect(isAmountDue({ ...base, ...o }, '2026-10-14T11:00')).toBe(false);
    }
  });
  it('canHaveAmount covers past or current booked client visits only', () => {
    expect(canHaveAmount(base, '2026-10-14T10:00')).toBe(true);
    expect(canHaveAmount(base, '2026-10-14T09:00')).toBe(false);
    expect(canHaveAmount({ ...base, status: 'cancelled' }, '2026-10-14T11:00')).toBe(false);
  });
  it('validates cents', () => {
    expect(isValidCents(0)).toBe(true);
    expect(isValidCents(MAX_AMOUNT_CENTS)).toBe(true);
    for (const bad of [-1, 1.5, MAX_AMOUNT_CENTS + 1, NaN, '45', null, undefined]) expect(isValidCents(bad)).toBe(false);
  });
});

describe('amount text', () => {
  it('parses comma, dot, whole and partial decimals to exact cents', () => {
    expect(parseAmountInput('45')).toBe(4500);
    expect(parseAmountInput('45,5')).toBe(4550);
    expect(parseAmountInput('45.50')).toBe(4550);
    expect(parseAmountInput(' 12,34 € ')).toBe(1234);
    expect(parseAmountInput('0,29')).toBe(29); // never through floats
    expect(parseAmountInput(',5')).toBe(50);
  });
  it('rejects garbage, signs, 3 decimals, empty and absurd amounts', () => {
    for (const bad of ['', ' ', 'abc', '-5', '1,005', '1 000', '1e3', '12,3,4', '100001']) expect(parseAmountInput(bad)).toBeNull();
    expect(parseAmountInput('100000')).toBe(MAX_AMOUNT_CENTS);
  });
  it('formats euros for lt-LT and round-trips the editable form', () => {
    expect(formatEuro(4500).replace(/\s/g, ' ')).toBe('45,00 €');
    expect(formatEuro(29).replace(/\s/g, ' ')).toBe('0,29 €');
    expect(formatAmountInput(4500)).toBe('45');
    expect(formatAmountInput(4550)).toBe('45,50');
    for (const c of [0, 29, 4500, 4550, 99999]) expect(parseAmountInput(formatAmountInput(c))).toBe(c);
  });
});

describe('repo amounts', () => {
  let db: VizitaiDB;
  let repo: ReturnType<typeof createRepo>;
  beforeEach(async () => {
    db = new VizitaiDB(`a-${crypto.randomUUID()}`);
    await ensureSeed(db);
    repo = createRepo(db);
  });
  const book = async () => {
    const [s] = await repo.listServices(true);
    return repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s.id, start: '2026-10-14T10:00' });
  };

  it('stores, clears and undoes an amount', async () => {
    const a = await book();
    const set = await repo.setAmount(a.id, 4500);
    expect(set.after.amountCents).toBe(4500);
    expect((await repo.entriesBetween('2026-10-14', '2026-10-15'))[0].amountCents).toBe(4500);
    await repo.putSnapshot(set.before); // undo
    expect((await repo.entriesBetween('2026-10-14', '2026-10-15'))[0].amountCents).toBeNull();
    await repo.setAmount(a.id, 1000);
    expect((await repo.setAmount(a.id, null)).after.amountCents).toBeNull();
  });
  it('rejects invalid cents', async () => {
    const a = await book();
    await expect(repo.setAmount(a.id, -5)).rejects.toThrow();
    await expect(repo.setAmount(a.id, 1.5)).rejects.toThrow();
  });
  it('travels through a backup, and an old backup without the field imports fine', async () => {
    const a = await book();
    await repo.setAmount(a.id, 4550);
    const json = JSON.stringify(await exportData(db));
    await Promise.all([db.clients.clear(), db.appointments.clear(), db.services.clear(), db.settings.clear()]);
    await importData(db, parseBackup(json));
    expect((await db.appointments.get(a.id))!.amountCents).toBe(4550);
    const old = JSON.parse(json);
    for (const x of old.appointments) delete x.amountCents;
    await importData(db, parseBackup(JSON.stringify(old)));
    expect((await db.appointments.get(a.id))!.amountCents).toBeUndefined();
    expect((await repo.entriesBetween('2026-10-14', '2026-10-15'))[0].amountCents).toBeNull();
  });
});
