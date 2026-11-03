import { describe, it, expect } from 'vitest';
import {
  agoParts, bandOf, buildAnalytics, clampWin, delta, heatOf, monthKeys, MONTHS, presetWin, ranking, records, retention, serviceSplit, slice, sum,
  type AnalyticsInput, type VisitRec,
} from '../../src/logic/analytics';

const NOW = '2026-11-03T10:24'; // a Tuesday
const v = (clientId: string, start: string, cents: number | null, extra: Partial<VisitRec> = {}): VisitRec =>
  ({ clientId, start, status: 'booked', cents, service: 'Kirpimas', ...extra });
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
    v('b', '2026-10-07T09:00', 3000, { service: 'Dažymas' }),
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
  it('keeps visits and money per day of the month', () => {
    expect(a.days.visits[oct]![5]).toBe(1);   // 6 October
    expect(a.days.cents[oct]![5]).toBe(5000);
    expect(a.days.cents[oct]![6]).toBe(3000); // 7 October
    expect(a.days.visits[oct]!.reduce((x, y) => x + y, 0)).toBe(a.visits[oct]);
    expect(a.days.visits[oct]![8]).toBe(0);   // the no-show of the 9th is not a visit
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

describe('hours: the whole working day, minus Nedirbu', () => {
  const off = (start: string, minutes: number) => ({ start, minutes });
  it('counts every day of the month with her working day (08:00-20:00 = 12 h), Sundays too, whatever the visits last', () => {
    const a = buildAnalytics(input([v('a', '2026-10-06T10:00', 4000), v('a', '2026-10-13T10:00', 4000)]));
    const oct = MONTHS - 2;
    expect(a.hours[oct]).toBe(31 * 12);
    expect(a.off[oct]).toBe(0);
    expect(a.perHour[oct]).toBe(Math.round(8000 / (31 * 12)));
  });
  it('takes Nedirbu off, a few hours or the whole day, and only what falls inside the working day', () => {
    const a = buildAnalytics(input(
      [v('a', '2026-10-06T10:00', 4000)],
      { off: [off('2026-10-02T09:00', 600), off('2026-10-03T08:00', 720), off('2026-10-04T06:00', 240)] },
    ));
    const oct = MONTHS - 2;
    // 10 h on the 2nd, the whole 12 h on the 3rd, and 06:00-10:00 on the 4th is only 2 h inside 08:00-20:00
    expect(a.off[oct]).toBe(10 + 12 + 2);
    expect(a.hours[oct]).toBe(31 * 12 - 24);
  });
  it('her example: visits from 10 to 3, Nedirbu from 3 to 5, more visits until 7, the day ends at 8 pm: 12 h minus 2 h', () => {
    const a = buildAnalytics(input([v('a', '2026-10-06T10:00', 1), v('a', '2026-10-06T17:00', 1)], { off: [off('2026-10-06T15:00', 120)] }));
    const oct = MONTHS - 2;
    expect(a.off[oct]).toBe(2);
    expect(a.hours[oct]).toBe(31 * 12 - 2);
  });
  it('does not count overlapping Nedirbu entries twice', () => {
    const a = buildAnalytics(input([v('a', '2026-10-06T10:00', 1)], { off: [off('2026-10-06T09:00', 180), off('2026-10-06T10:00', 180)] })); // 09-12 and 10-13
    expect(a.off[MONTHS - 2]).toBe(4);
  });
  it('counts today only up to now, and nothing before her first entry', () => {
    const a = buildAnalytics(input([v('a', '2026-10-06T10:00', 1)]));
    // 1 and 2 November: 24 h; 3 November (it is 10:24): 08:00-10:24 = 2.4 h
    expect(a.hours[MONTHS - 1]).toBeCloseTo(24 + 2.4);
    expect(a.hours[0]).toBe(0);
    expect(a.hours[MONTHS - 3]).toBe(0); // September, before the first entry
    expect(a.hours[MONTHS - 2]).toBe(31 * 12);
  });
  it('does not count weekdays she does not work (Sunday and Monday off), visits there still count as visits', () => {
    // October 2026: 31 days, Sundays 4, 11, 18, 25 and Mondays 5, 12, 19, 26 -> 23 days of 12 h
    const a = buildAnalytics(input([v('a', '2026-10-05T10:00', 1000)], { workDays: [1, 2, 3, 4, 5] }));
    expect(a.hours[MONTHS - 2]).toBe(23 * 12);
    expect(a.visits[MONTHS - 2]).toBe(1);
    // Nedirbu on a day she does not work changes nothing
    const b = buildAnalytics(input([v('a', '2026-10-05T10:00', 1000)], { workDays: [1, 2, 3, 4, 5], off: [{ start: '2026-10-04T09:00', minutes: 240 }] }));
    expect(b.off[MONTHS - 2]).toBe(0);
    expect(b.hours[MONTHS - 2]).toBe(23 * 12);
  });
  it('counts the days that had visits', () => {
    const a = buildAnalytics(input([v('a', '2026-10-06T10:00', 1), v('b', '2026-10-06T12:00', 1), v('a', '2026-10-13T10:00', 1)]));
    expect(a.visitDays[MONTHS - 2]).toBe(2);
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
