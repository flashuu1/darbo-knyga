import { describe, expect, it } from 'vitest';
import { glyphFor } from '../../src/logic/glyph';
import { defaultPersonalNames } from '../../src/i18n/lt';

describe('no choice card looks like the red of Asmeninis entries', () => {
  it('uses neither red nor pink for any of the common words', () => {
    for (const n of defaultPersonalNames) expect(['red', 'pink']).not.toContain(glyphFor(n).color);
  });
  it('Daktaras and Masažas in particular', () => {
    expect(glyphFor('Daktaras').color).toBe('blue');
    expect(glyphFor('Masažas').color).toBe('purple');
  });
});
