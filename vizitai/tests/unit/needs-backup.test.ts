import { describe, it, expect } from 'vitest';
import { needsBackup } from '../../src/logic/backup';

const now = new Date('2026-10-14T12:00:00Z');
describe('needsBackup', () => {
  it('is false when there is no data yet', () => expect(needsBackup(null, false, now)).toBe(false));
  it('is false when there is no data even if the last backup is old', () => expect(needsBackup('2026-01-01T00:00:00Z', false, now)).toBe(false));
  it('is true when there is data and no backup', () => expect(needsBackup(null, true, now)).toBe(true));
  it('is false within 7 days', () => expect(needsBackup('2026-10-08T12:00:01Z', true, now)).toBe(false));
  it('is true after 7 days', () => expect(needsBackup('2026-10-07T11:59:59Z', true, now)).toBe(true));
});
