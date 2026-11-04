import { describe, expect, it } from 'vitest';
import { glyphFor, serviceGlyph } from '../../src/logic/glyph';

describe('a picture for each service', () => {
  it('knows the services of a hairdresser, in any ending and case', () => {
    expect(serviceGlyph('Kirpimas')).toBe('✂️');
    expect(serviceGlyph('MOTERIŠKAS KIRPIMAS')).toBe('✂️');
    expect(serviceGlyph('Dažymas')).toBe('🎨');
    expect(serviceGlyph('Sruogelės')).toBe('✨');
    expect(serviceGlyph('Vestuvės')).toBe('👰');
    expect(serviceGlyph('Šukuosena')).not.toBe('S'); // has a picture, not a letter
  });
  it('a service that is both is not just one of them', () => {
    expect(serviceGlyph('Kirpimas ir dažymas')).toBe('💇');
    expect(serviceGlyph('Kirpimas ir dažymas')).not.toBe(serviceGlyph('Kirpimas'));
  });
  it('the services of the starting list all have their own picture, and a name it does not know gets the first letter', () => {
    const names = ['Kirpimas', 'Dažymas', 'Kirpimas ir dažymas', 'Sruogelės', 'Šukuosena', 'Vestuvės'];
    expect(new Set(names.map(serviceGlyph)).size).toBe(names.length);
    expect(serviceGlyph('Kita')).toBe(glyphFor('Kita').glyph);
    expect(serviceGlyph('Kita')).toBe('K');
  });
});
