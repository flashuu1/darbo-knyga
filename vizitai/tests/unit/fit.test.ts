import { describe, expect, it } from 'vitest';
import { fitFor } from '../../src/logic/fit';

describe('how much of an entry fits', () => {
  it('goes by the height of the entry itself', () => {
    expect(fitFor(9, true)).toBe('xs');
    expect(fitFor(15, true)).toBe('x');
    expect(fitFor(25, false)).toBe('s');
    expect(fitFor(35, false)).toBe('m');
    expect(fitFor(70, false)).toBe('l');
  });
  it('a one-line entry is complete from 40 px, a stacked one needs 54 px', () => {
    expect(fitFor(42, true)).toBe('l');
    expect(fitFor(42, false)).toBe('m');
    expect(fitFor(54, false)).toBe('l');
  });
  it('an hour at the smallest zoom (about 35 px) still shows time and name', () => {
    expect(fitFor(4 * 8.8, false)).toBe('m');
  });
});
