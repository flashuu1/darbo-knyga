import { describe, expect, it } from 'vitest';
import { busyFrom, freeGaps, rankSlots, recWindow, slotKey, slotsFor, weekdayOf, type FreeSettings } from '../../src/logic/freetime';

const S: FreeSettings = { dayStart: '08:00', dayEnd: '20:00' };
const WEEK = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']; // Monday to Sunday
const at = (date: string, from: string, to: string) => ({ start: `${date}T${from}`, minutes: (+to.slice(0, 2) * 60 + +to.slice(3)) - (+from.slice(0, 2) * 60 + +from.slice(3)) });
const NOW = '2026-10-12T08:00'; // Monday morning: nothing is over yet

describe('the window', () => {
  it('is 11:00–18:00 unless she changes it, and never outside her working hours', () => {
    expect(recWindow(S)).toEqual([660, 1080]);
    expect(recWindow({ ...S, recFrom: '12:00', recTo: '16:30' })).toEqual([720, 990]);
    expect(recWindow({ ...S, dayStart: '12:00', dayEnd: '17:00' })).toEqual([720, 1020]);
    const [a, b] = recWindow({ dayStart: '08:00', dayEnd: '10:00' }); expect(b).toBeLessThanOrEqual(a); // nothing to suggest
    expect(freeGaps(WEEK, [], { dayStart: '08:00', dayEnd: '10:00' }, NOW)).toEqual([]);
  });
});

describe('the gaps', () => {
  it('a day with nothing in it is one gap, the whole window', () => {
    const g = freeGaps(['2026-10-13'], [], S, NOW);
    expect(g).toEqual([{ date: '2026-10-13', start: 660, end: 1080 }]);
  });
  it('visits cut the window into gaps; what is outside the window does not matter', () => {
    const busy = [at('2026-10-15', '09:00', '10:30'), at('2026-10-15', '12:00', '13:00'), at('2026-10-15', '13:00', '15:00'), at('2026-10-15', '16:00', '18:00'), at('2026-10-15', '18:30', '19:30')];
    const g = freeGaps(['2026-10-15'], busy, S, NOW);
    expect(g.map((x) => [x.start / 60, x.end / 60])).toEqual([[11, 12], [15, 16]]); // 11–12 and 15–16
  });
  it('a visit that starts before the window or ends after it still blocks its part', () => {
    const g = freeGaps(['2026-10-13'], [at('2026-10-13', '10:30', '11:30'), at('2026-10-13', '17:30', '18:30')], S, NOW);
    expect(g.map((x) => [x.start, x.end])).toEqual([[690, 1050]]);
  });
  it('a gap under 15 minutes is not a gap', () => {
    expect(freeGaps(['2026-10-13'], [at('2026-10-13', '11:00', '12:00'), at('2026-10-13', '12:10', '18:00')], S, NOW)).toEqual([]);
  });
  it('Nedirbu and her own entries block, cancelled visits, no-shows and expenses do not', () => {
    const entries = [
      { appt: { start: '2026-10-13T12:00', status: 'booked', kind: 'personal' }, minutes: 120 },
      { appt: { start: '2026-10-13T14:00', status: 'cancelled', kind: 'client' }, minutes: 60 },
      { appt: { start: '2026-10-13T15:00', status: 'noshow', kind: 'client' }, minutes: 60 },
      { appt: { start: '2026-10-13T16:00', status: 'booked', kind: 'expense' }, minutes: 15 },
      { appt: { start: '2026-10-13T16:30', status: 'booked', kind: 'client' }, minutes: 60 },
    ];
    const g = freeGaps(['2026-10-13'], busyFrom(entries), S, NOW);
    expect(g.map((x) => [x.start / 60, x.end / 60])).toEqual([[11, 12], [14, 16.5], [17.5, 18]]);
  });
  it('days she does not work, days that are over and the part of today that is over are not offered', () => {
    const today = '2026-10-14T13:07';
    const g = freeGaps(WEEK, [], { ...S, workDays: [0, 1, 2, 3, 4, 5] }, today); // Sunday off
    expect(g.some((x) => x.date === '2026-10-18')).toBe(false);
    expect(g.some((x) => x.date < '2026-10-14')).toBe(false);
    const todayGap = g.find((x) => x.date === '2026-10-14')!;
    expect(todayGap.start).toBe(13 * 60 + 15); // the next quarter after 13:07
    expect(freeGaps(['2026-10-14'], [], S, '2026-10-14T17:50')).toEqual([]); // nothing left of today's window
  });
  it('weekdays are counted from Monday', () => {
    expect(weekdayOf('2026-10-12')).toBe(0);
    expect(weekdayOf('2026-10-18')).toBe(6);
  });
});

describe('which gap, for which service', () => {
  // Thursday: one free hour at 15:00. Saturday afternoon: four free hours. Friday: two hours.
  const busy = [
    ...WEEK.slice(0, 3).map((d) => at(d, '11:00', '18:00')),
    at('2026-10-15', '11:00', '15:00'), at('2026-10-15', '16:00', '18:00'),
    at('2026-10-16', '11:00', '14:00'), at('2026-10-16', '16:00', '18:00'),
    at('2026-10-17', '11:00', '14:00'),
  ];
  const gaps = freeGaps(WEEK, busy, { ...S, workDays: [0, 1, 2, 3, 4, 5] }, NOW);
  it('only the gaps a service fits in are offered, and a longer service has fewer', () => {
    expect(slotsFor(gaps, 60, WEEK, S).map(slotKey)).toEqual(['2026-10-15T15:00', '2026-10-16T14:00', '2026-10-17T14:00']);
    expect(slotsFor(gaps, 120, WEEK, S).map(slotKey)).toEqual(['2026-10-16T14:00', '2026-10-17T14:00']);
    expect(slotsFor(gaps, 300, WEEK, S)).toEqual([]);
  });
  it('the suggestion starts at the start of the gap and says what is left', () => {
    const s = slotsFor(gaps, 60, WEEK, S).find((x) => x.date === '2026-10-17')!;
    expect(s).toMatchObject({ start: 14 * 60, end: 15 * 60, slack: 180 });
  });
  it('"fit" takes the gap that fits best (Thursday 15:00), "free" the one with the most room (Saturday)', () => {
    const slots = slotsFor(gaps, 60, WEEK, S);
    expect(slotKey(rankSlots(slots, 'fit')[0]!)).toBe('2026-10-15T15:00');
    expect(slotKey(rankSlots(slots, 'free')[0]!)).toBe('2026-10-17T14:00');
  });
  it('a day that is mostly free has a high share, a full day a low one', () => {
    const slots = slotsFor(gaps, 60, WEEK, S);
    const sat = slots.find((x) => x.date === '2026-10-17')!, thu = slots.find((x) => x.date === '2026-10-15')!;
    expect(sat.dayFrac).toBeCloseTo(240 / 420, 2);
    expect(thu.dayFrac).toBeCloseTo(60 / 420, 2);
  });
  it('the only free hour of the week is the one that is suggested', () => {
    const only = freeGaps(WEEK, [...WEEK.slice(0, 7).map((d) => at(d, '11:00', '15:00')), ...WEEK.map((d) => at(d, '16:00', '18:00'))], { ...S, workDays: [3] }, NOW);
    const slots = slotsFor(only, 60, WEEK, S);
    expect(rankSlots(slots, 'free').map(slotKey)).toEqual(['2026-10-15T15:00']);
  });
});
