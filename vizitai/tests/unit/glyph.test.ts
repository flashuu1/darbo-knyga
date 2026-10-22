import { describe, expect, it } from 'vitest';
import { glyphFor } from '../../src/logic/glyph';
import { defaultPersonalNames } from '../../src/i18n/lt';

describe('a picture for each choice', () => {
  it('knows the common words, with and without the Lithuanian endings', () => {
    expect(glyphFor('Psichologas').glyph).toBe('🧠');
    expect(glyphFor('Psichiatras / psichiatrė').glyph).toBe('💊');
    expect(glyphFor('Neurologas / neurologė').glyph).toBe('⚡');
    expect(glyphFor('Daktaras').glyph).toBe('🩺');
    expect(glyphFor('Šeimos gydytojas').glyph).toBe('🏥'); // not the same picture as Daktaras
    expect(glyphFor('Dantistas').glyph).toBe('🦷');
    expect(glyphFor('Akių gydytojas').glyph).toBe('👁️'); // before "gydytojas"
    expect(glyphFor('Nuoma').glyph).toBe('🏠');
    expect(glyphFor('MOKESČIAI').glyph).toBe('🧾');
  });
  it('gives every word it starts with its own picture, and different colours across the list', () => {
    const g = defaultPersonalNames.map(glyphFor);
    expect(g.every((x) => x.glyph.length > 0 && x.glyph.length <= 3)).toBe(true);
    expect(new Set(g.map((x) => x.color)).size).toBeGreaterThanOrEqual(5);
  });
  it('for a word it does not know: the first letter, on a colour that stays the same', () => {
    expect(glyphFor('Sporto salė').glyph).toBe('S');
    expect(glyphFor('Sporto salė')).toEqual(glyphFor('sporto salė'));
    expect(glyphFor('  ąžuolas').glyph).toBe('Ą');
    expect(glyphFor('').glyph).toBe('•');
  });
});
