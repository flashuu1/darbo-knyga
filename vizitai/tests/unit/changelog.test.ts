import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../../src/i18n/changelog';

describe('the changelog (every build gets an entry)', () => {
  it('is newest first by date', () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(CHANGELOG[i - 1]!.date >= CHANGELOG[i]!.date).toBe(true);
  });
  it('has the id of its build on every entry except the newest, which is the running build', () => {
    expect(CHANGELOG[0]!.build).toBeUndefined();
    for (const e of CHANGELOG.slice(1)) expect(e.build, `entry of ${e.date}`).toMatch(/^[0-9a-f]{7}$/);
    const ids = CHANGELOG.slice(1).map((e) => e.build);
    expect(new Set(ids).size).toBe(ids.length); // one entry per build
  });
  it('uses exactly three kinds, always with a text, a valid date, at least one item', () => {
    for (const e of CHANGELOG) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.items.length).toBeGreaterThan(0);
      for (const it of e.items) {
        expect(['bugfix', 'change', 'feature']).toContain(it.kind);
        expect(it.text.trim().length).toBeGreaterThan(8);
      }
    }
  });
});
