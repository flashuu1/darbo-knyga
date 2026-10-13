import { describe, it, expect } from 'vitest';
import { formatDayLong, formatDayShort, weekdayShort, formatWhen } from '../../src/i18n/format';

describe('lt-LT formatting', () => {
  it('formats the long day', () => expect(formatDayLong('2026-10-14')).toBe('spalio 14 d., trečiadienis'));
  it('formats the short day', () => expect(formatDayShort('2026-10-14')).toBe('spalio 14 d.'));
  it('uses Lithuanian short weekdays', () => {
    const days = ['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18'].map(weekdayShort);
    expect(days).toEqual(['pr', 'an', 'tr', 'kt', 'pn', 'št', 'sk']);
  });
  it('formats a start time', () => expect(formatWhen('2026-10-14T10:30')).toBe('spalio 14 d., tr · 10:30'));
});
