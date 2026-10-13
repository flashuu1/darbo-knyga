import { describe, it, expect } from 'vitest';
import { layoutColumns, visibleRange } from '../../src/logic/layout';

describe('layoutColumns', () => {
  it('gives non-overlapping blocks a single full-width column', () => {
    const m = layoutColumns([{ id: 'a', start: 600, end: 660 }, { id: 'b', start: 660, end: 720 }]);
    expect(m.get('a')).toEqual({ col: 0, cols: 1 });
    expect(m.get('b')).toEqual({ col: 0, cols: 1 });
  });
  it('places overlapping blocks side by side', () => {
    const m = layoutColumns([{ id: 'a', start: 600, end: 660 }, { id: 'b', start: 630, end: 690 }]);
    expect(m.get('a')).toEqual({ col: 0, cols: 2 });
    expect(m.get('b')).toEqual({ col: 1, cols: 2 });
  });
  it('reuses a free column inside a cluster', () => {
    const m = layoutColumns([
      { id: 'a', start: 600, end: 720 }, { id: 'b', start: 610, end: 630 }, { id: 'c', start: 640, end: 660 },
    ]);
    expect(m.get('c')).toEqual({ col: 1, cols: 2 });
  });
});

describe('visibleRange (bookings outside working hours stay visible)', () => {
  const hours = { dayStart: '08:00', dayEnd: '20:00' };
  it('uses working hours when entries fit', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T10:00' }, minutes: 60 }])).toEqual({ startMin: 480, endMin: 1200 });
  });
  it('grows earlier for an early booking', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T06:30' }, minutes: 60 }]).startMin).toBe(360);
  });
  it('grows later for a booking running past the end', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T19:45' }, minutes: 120 }]).endMin).toBe(1320);
  });
  it('clips at midnight', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T23:00' }, minutes: 180 }]).endMin).toBe(1440);
  });
});
