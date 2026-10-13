import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { edgeSide, exceedsThreshold, HOLD_MS, MOVE_THRESHOLD_PX, startFromY } from '../../src/logic/drag';

const col = { date: '2026-10-14', rangeStartMin: 480, rows: 8, colTop: 100, colHeight: 400 }; // 50px per 15 min

describe('drag math', () => {
  it('uses the spec timings', () => { expect(HOLD_MS).toBe(400); expect(MOVE_THRESHOLD_PX).toBe(8); });
  it('treats movement over 8px as a scroll', () => {
    expect(exceedsThreshold(5, 5)).toBe(false);
    expect(exceedsThreshold(0, 9)).toBe(true);
  });
  it('drops on whole 5 minutes (smooth, not 15-minute jumps)', () => {
    expect(startFromY({ ...col, y: 250, grabDY: 0 })).toBe('2026-10-14T08:45');
    expect(startFromY({ ...col, y: 261, grabDY: 0 })).toBe('2026-10-14T08:50');
    expect(startFromY({ ...col, y: 275, grabDY: 0 })).toBe('2026-10-14T08:55');
    expect(startFromY({ ...col, y: 292, grabDY: 0 })).toBe('2026-10-14T09:00');
  });
  it('accounts for where the entry was grabbed', () => {
    expect(startFromY({ ...col, y: 270, grabDY: 20 })).toBe('2026-10-14T08:45');
  });
  it('clamps inside the visible range', () => {
    expect(startFromY({ ...col, y: -500, grabDY: 0 })).toBe('2026-10-14T08:00');
    expect(startFromY({ ...col, y: 5000, grabDY: 0 })).toBe('2026-10-14T09:45');
  });
  it('detects the screen edges', () => {
    expect(edgeSide(5, 430)).toBe(-1);
    expect(edgeSide(425, 430)).toBe(1);
    expect(edgeSide(200, 430)).toBe(0);
  });
});

describe('entry long-press CSS', () => {
  it('disables the iOS text callout and selection on entries', () => {
    const rule = /^\.entry \{[^}]*\}/m.exec(readFileSync('src/styles.css', 'utf8'))?.[0] ?? '';
    expect(rule).toContain('-webkit-touch-callout: none');
    expect(rule).toContain('user-select: none');
  });
});
