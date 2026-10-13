import { describe, it, expect } from 'vitest';
import { layoutColumns, layoutLanes, visibleRange } from '../../src/logic/layout';

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

describe('layoutLanes (overlaps never bleed)', () => {
  const at = (id: string, start: number, len = 15) => ({ id, start, end: start + len });
  it('keeps clusters that fit as they are', () => {
    const r = layoutLanes([at('a', 600), at('b', 600), at('c', 600)], 3);
    expect([...r.placed.values()]).toEqual([{ col: 0, cols: 3 }, { col: 1, cols: 3 }, { col: 2, cols: 3 }]);
    expect(r.overflow).toEqual([]);
  });
  it('gathers the lanes past the cap into one +N group per start', () => {
    const r = layoutLanes([at('a', 600), at('b', 600), at('c', 600), at('d', 600), at('e', 600)], 3);
    expect(r.placed.get('a')).toEqual({ col: 0, cols: 3 });
    expect(r.placed.get('b')).toEqual({ col: 1, cols: 3 });
    expect(r.placed.has('c')).toBe(false);
    expect(r.overflow).toEqual([{ start: 600, ids: ['c', 'd', 'e'], col: 2, cols: 3 }]);
  });
  it('keeps separate groups for separate starts and leaves other clusters alone', () => {
    const r = layoutLanes([at('a', 600, 60), at('b', 600, 60), at('c', 615), at('d', 630), at('x', 720)], 2);
    expect(r.placed.get('a')).toEqual({ col: 0, cols: 2 });
    expect(r.overflow.map((g) => [g.start, g.ids])).toEqual([[600, ['b']], [615, ['c']], [630, ['d']]]);
    expect(r.placed.get('x')).toEqual({ col: 0, cols: 1 });
  });
});

describe('visibleRange (bookings outside working hours stay visible)', () => {
  const hours = { dayStart: '08:00', dayEnd: '20:00' };
  it('uses working hours plus an hour on each side when entries fit', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T10:00' }, minutes: 60 }])).toEqual({ startMin: 420, endMin: 1260 });
  });
  it('never pads past midnight', () => {
    expect(visibleRange({ dayStart: '00:30', dayEnd: '23:45' }, [])).toEqual({ startMin: 0, endMin: 1440 });
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
