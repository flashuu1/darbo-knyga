import { describe, it, expect } from 'vitest';
import { cleanName, foldName, ltCollator } from '../../src/logic/names';

describe('names', () => {
  it('trims and collapses spaces', () => expect(cleanName('  Jonas   Jonaitis ')).toBe('Jonas Jonaitis'));
  it('folds Lithuanian diacritics and case', () => {
    expect(foldName('Žydrūnė')).toBe('zydrune');
    expect(foldName('ĄČĘĖĮŠŲŪŽ')).toBe('aceeisuuz');
    expect(foldName('  ŽYDRŪNĖ  ')).toBe('zydrune');
  });
  it('sorts with lt rules (Z before Ž, Y between I and K)', () => {
    expect(['Žydrūnė', 'Zita'].sort(ltCollator.compare)).toEqual(['Zita', 'Žydrūnė']);
    expect(['Jonas', 'Yra', 'Ilona'].sort(ltCollator.compare)).toEqual(['Ilona', 'Yra', 'Jonas']);
  });
});
