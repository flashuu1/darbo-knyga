import { describe, it, expect } from 'vitest';
import { formatBuildTime, formatDayLong, formatDayShort, weekdayShort, formatWhen } from '../../src/i18n/format';

describe('lt-LT formatting', () => {
  it('formats the long day', () => expect(formatDayLong('2026-10-14')).toBe('spalio 14 d., trečiadienis'));
  it('formats the short day', () => expect(formatDayShort('2026-10-14')).toBe('spalio 14 d.'));
  it('uses Lithuanian short weekdays', () => {
    const days = ['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18'].map(weekdayShort);
    expect(days).toEqual(['pr', 'an', 'tr', 'kt', 'pn', 'št', 'sk']);
  });
  it('formats the build time in Vilnius time, 24-hour', () => {
    expect(formatBuildTime('2026-10-14T12:42:00Z')).toBe('2026 m. spalio 14 d. 15:42'); // summer time, UTC+3
    expect(formatBuildTime('2026-12-01T12:05:00.000Z')).toBe('2026 m. gruodžio 1 d. 14:05'); // winter time, UTC+2
    // DST ends 2026-10-25 at 01:00 UTC (04:00 EEST -> 03:00 EET): both instants read 03:30 locally
    expect(formatBuildTime('2026-10-25T00:30:00Z')).toBe('2026 m. spalio 25 d. 03:30');
    expect(formatBuildTime('2026-10-25T01:30:00Z')).toBe('2026 m. spalio 25 d. 03:30');
    expect(formatBuildTime('2026-10-24T21:15:00Z')).toBe('2026 m. spalio 25 d. 00:15'); // crosses midnight locally
  });
  it('shows an unparsable build time as is', () => expect(formatBuildTime('dev')).toBe('dev'));
  it('formats a start time', () => expect(formatWhen('2026-10-14T10:30')).toBe('spalio 14 d., tr · 10:30'));
});
