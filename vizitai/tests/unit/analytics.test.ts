import { describe, it, expect } from 'vitest';
import {
  agoParts, bandOf, buildAnalytics, clampWin, delta, heatOf, monthKeys, MONTHS, presetWin, ranking, records, retention, serviceSplit, slice, sum,
  type AnalyticsInput, type VisitRec,
} from '../../src/logic/analytics';

const NOW = '2026-11-03T10:24'; // a Tuesday
const v = (clientId: string, start: string, cents: number | null, extra: Partial<VisitRec> = {}): VisitRec =>
  ({ clientId, start, status: 'booked', minutes: 60, cents, service: 'Kirpimas', ...extra });
const input = (visits: VisitRec[], extra: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  now: NOW, visits, off: [], clients: [{ id: 'a', name: 'Ona' }, { id: 'b', name: 'Zita' }, { id: 'c', name: 'Rasa' }], dayStart: '08:00', dayEnd: '20:00', ...extra,
});

describe('months', () => {
  it('lists 24 months ending with the current one, across a year change', () => {
    const k = monthKeys(NOW);
    expect(k).toHaveLength(MONTHS);
    expect(k[MONTHS - 1]).toBe('2026-11');
    expect(k[MONTHS - 2]).toBe('2026-10');
    expect(k[0]).toBe('2024-12');
    expect(monthKeys('2026-01-15T10:00')[MONTHS - 2]).toBe('2025-12');
  });
  it('puts times of day into the four bands', () => {
    expect([8, 10, 11, 13, 14, 16, 17, 20].map(bandOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('the numbers per month', () => {
  const a = buildAnalytics(input([
    v('a', '2026-09-08T10:00', 4000), v('a', '2026-10-06T10:00', 5000), v('a', '2026-10-20T14:00', 6000),
    v('b', '2026-10-07T09:00', 3000, { service: 'Dažymas', minutes: 120 }),
    v('b', '2026-10-21T09:00', null), // took place, no amount yet
    v('c', '2026-10-09T09:00', 3500, { status: 'noshow' }), v('c', '2026-10-10T09:00', 3500, { status: 'cancelled' }),
    v('a', '2026-11-20T10:00', null), // in the future: nothing counts, but it is a booking
  ]));
  const oct = MONTHS - 2, sep = MONTHS - 3;
  it('counts visits and money of past, kept visits only', () => {
    expect(a.visits[oct]).toBe(4);
    expect(a.cents[oct]).toBe(14000);
    expect(a.visits[sep]).toBe(1);
    expect(a.visits[MONTHS - 1]).toBe(0);
    expect(a.avgCents[oct]).toBeCloseTo(14000 / 3);
  });
  it('counts no-shows and cancellations, and what they cost at the usual amount', () => {
    expect(a.missed[oct]).toBe(1);
    expect(a.cancelled[oct]).toBe(1);
    expect(a.lostCents[oct]).toBe(Math.round(2 * (14000 / 3)));
  });
  it('knows when each client came first, and how many clients there were', () => {
    expect(a.newClients[sep]).toBe(1);   // Ona
    expect(a.newClients[oct]).toBe(1);   // Zita (Rasa never had a kept visit)
    expect(a.totalClients[oct]).toBe(2);
    expect(a.totalClients[MONTHS - 1]).toBe(2);
    expect(a.people.find((p) => p.id === 'a')).toMatchObject({ total: 3, spent: 15000, hasUpcoming: true });
  });
  it('splits the money by service and fills the weekday map', () => {
    expect(a.services.map((s) => s.name)).toEqual(['Kirpimas', 'Dažymas']);
    expect(serviceSplit(a, presetWin(3))).toEqual([{ name: 'Kirpimas', cents: 15000 }, { name: 'Dažymas', cents: 3000 }]);
    const heat = heatOf(a, presetWin(3));
    expect(sum(heat.flat())).toBe(5); // 5 kept visits in Sep-Nov
    expect(heat[1]![0]).toBeGreaterThan(0); // Tuesday morning
  });
});

describe('hours and utilisation', () => {
  it('uses Monday to Saturday of the month, minus days off, against the booked hours', () => {
    const a = buildAnalytics(input(
      [v('a', '2026-10-06T10:00', 4000, { minutes: 120 }), v('a', '2026-10-13T10:00', 4000, { minutes: 180 })],
      { off: [{ start: '2026-10-02T09:00', minutes: 600 }] },
    ));
    const oct = MONTHS - 2;
    // October 2026 has 31 days, 4 Sundays (4, 11, 18, 25): 27 working days x 12 h = 324 h; 10 h off
    expect(a.off[oct]).toBe(10);
    expect(a.booked[oct]).toBe(5);
    expect(a.free[oct]).toBeCloseTo(324 - 10 - 5);
    expect(a.util[oct]).toBe(Math.round(5 / 314 * 100));
    expect(a.perHour[oct]).toBe(Math.round(8000 / 5));
  });
  it('counts the current month only up to today', () => {
    const a = buildAnalytics(input([]));
    // 1-3 November 2026: Sunday, Monday, Tuesday -> two working days
    expect(a.free[MONTHS - 1]).toBe(24);
  });
});

describe('periods', () => {
  const a = buildAnalytics(input([v('a', '2026-10-06T10:00', 5000), v('a', '2026-09-06T10:00', 2500), v('b', '2026-08-04T10:00', 1000)]));
  it('keeps a window at least three months wide and inside the 24', () => {
    expect(clampWin({ from: 20, to: 22 })).toEqual({ from: 20, to: 22 });
    expect(clampWin({ from: 22, to: 23 })).toEqual({ from: 21, to: 23 });
    expect(clampWin({ from: -4, to: 40 })).toEqual({ from: 0, to: 23 });
    expect(presetWin(12)).toEqual({ from: 12, to: 23 });
  });
  it('compares with the period right before, and says nothing when there is none', () => {
    const w = presetWin(3); // Sep, Oct, Nov
    expect(delta(a.cents, w)).toBe(Math.round((7500 - 1000) / 1000 * 100)); // vs Jun, Jul, Aug
    expect(delta(a.cents, presetWin(24))).toBeNull();
    expect(delta(a.visits, { from: 0, to: 2 })).toBeNull();
    expect(delta(new Array(MONTHS).fill(0), presetWin(3))).toBeNull(); // nothing to compare with
  });
  it('finds the busiest and richest month and the best weekday', () => {
    const r = records(a, presetWin(6));
    expect(r.busiest).toMatchObject({ month: MONTHS - 2, value: 1 });
    expect(r.richest).toEqual({ month: MONTHS - 2, value: 5000 });
    expect(r.bestDay!.value).toBeGreaterThan(0);
    expect(records(buildAnalytics(input([])), presetWin(3))).toEqual({ busiest: null, richest: null, bestDay: null });
  });
  it('ranks clients by visits or by money inside the window', () => {
    expect(ranking(a, presetWin(6), 'visits', 5).map((r) => [r.name, r.value])).toEqual([['Ona', 2], ['Zita', 1]]);
    expect(ranking(a, presetWin(3), 'cents', 5).map((r) => r.name)).toEqual(['Ona']);
    expect(slice(ranking(a, presetWin(6), 'cents', 1).map((r) => r.trend.length), { from: 0, to: 0 })).toEqual([6]);
  });
  it('tells how many new clients came back', () => {
    const b = buildAnalytics(input([v('a', '2026-10-01T10:00', 1), v('a', '2026-10-20T10:00', 1), v('a', '2026-11-02T10:00', 1), v('b', '2026-10-02T10:00', 1)]));
    const r = retention(b, presetWin(3));
    expect(r.count).toBe(2);
    expect(r.reach.slice(0, 4)).toEqual([100, 50, 50, 0]);
  });
});

describe('rhythm', () => {
  const day = (n: number) => { const d = new Date(Date.UTC(2026, 10, 3 - n)); return `${d.toISOString().slice(0, 10)}T10:00`; };
  it('finds clients who are well past their usual gap and have nothing booked', () => {
    const a = buildAnalytics(input([
      v('a', day(120), 1), v('a', day(90), 1), v('a', day(60), 1), v('a', day(50), 1), // every ~23 days, last 50 days ago
      v('b', day(100), 1), v('b', day(70), 1), v('b', day(40), 1), v('b', day(10), 1), // every 30 days, last 10 days ago: on time
      v('c', day(60), 1), v('c', day(30), 1), v('c', day(2), 1), v('c', '2026-11-20T10:00', null), // regular and booked again
    ]));
    expect(a.gaps.map((g) => g.id)).toEqual(['a']);
    expect(a.gaps[0]!.gapDays).toBeCloseTo(70 / 3);
    expect(a.gaps[0]!.ratio).toBeGreaterThan(2);
    expect(a.avgGapDays).toBeGreaterThan(20);
  });
  it('words "how long ago"', () => {
    expect(agoParts(null, NOW)).toBeNull();
    expect(agoParts('2026-11-03', NOW)).toEqual({ key: 'today', n: 0 });
    expect(agoParts('2026-11-02', NOW)).toEqual({ key: 'yesterday', n: 1 });
    expect(agoParts('2026-10-29', NOW)).toEqual({ key: 'days', n: 5 });
    expect(agoParts('2026-10-06', NOW)).toEqual({ key: 'weeks', n: 4 });
    expect(agoParts('2026-07-03', NOW)).toEqual({ key: 'months', n: 4 });
  });
});
