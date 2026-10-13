import { describe, it, expect } from 'vitest';
import { addDays, addMinutes, format, parse, snap, snapClock, timePart, weekStart, nowLocal, minutesOfDay, hhmm } from '../../src/logic/time';

describe('wall-clock time', () => {
  it('keeps 10:00 on the DST change day (2026-10-25)', () => {
    expect(format(parse('2026-10-25T10:00'))).toBe('2026-10-25T10:00');
    expect(timePart('2026-10-25T10:00')).toBe('10:00');
  });
  it('does arithmetic on the wall clock through the DST night', () => {
    expect(addMinutes('2026-10-25T02:45', 30)).toBe('2026-10-25T03:15');
    expect(addMinutes('2026-10-25T03:30', 60)).toBe('2026-10-25T04:30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
  it('finds the Monday of a week, including across year end', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });
  it('snaps to the 15-minute grid', () => {
    expect(snap('2026-10-14T10:07')).toBe('2026-10-14T10:00');
    expect(snap('2026-10-14T10:08')).toBe('2026-10-14T10:15');
    expect(snap('2026-10-14T10:01', 15, 'ceil')).toBe('2026-10-14T10:15');
    expect(snap('2026-10-14T10:14', 15, 'floor')).toBe('2026-10-14T10:00');
    expect(snap('2026-10-14T10:15', 15, 'ceil')).toBe('2026-10-14T10:15');
  });
  it('reads the local clock without UTC conversion', () => {
    expect(nowLocal(new Date(2026, 9, 14, 9, 5))).toBe('2026-10-14T09:05');
  });
  it('converts minutes of day', () => {
    expect(minutesOfDay('2026-10-14T08:30')).toBe(510);
    expect(hhmm(510)).toBe('08:30');
  });
  it('rejects malformed strings', () => {
    expect(() => parse('2026-10-14 10:00')).toThrow();
  });
});

describe('snapClock (working hours; iOS ignores step)', () => {
  it('rounds to the 15-minute grid', () => {
    expect(snapClock('08:07')).toBe('08:00');
    expect(snapClock('08:08')).toBe('08:15');
    expect(snapClock('08:00')).toBe('08:00');
    expect(snapClock('19:52')).toBe('19:45');
    expect(snapClock('19:53')).toBe('20:00');
  });
  it('never rolls past midnight', () => expect(snapClock('23:58')).toBe('23:45'));
});
