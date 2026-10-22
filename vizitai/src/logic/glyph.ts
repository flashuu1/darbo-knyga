/** A picture and a colour for one of her own choices, from its name (she types the names, so this is a guess that is right for the common words). */
export type GlyphColor = 'blue' | 'green' | 'indigo' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow';
export interface Glyph { glyph: string; color: GlyphColor }

// stems, lower case, without relying on Lithuanian endings
const RULES: [string, string, GlyphColor][] = [
  ['psichol', '🧠', 'purple'], ['psichiatr', '💊', 'indigo'], ['neurolog', '⚡', 'yellow'],
  ['dantist', '🦷', 'teal'], ['odontol', '🦷', 'teal'], ['akių', '👁️', 'blue'], ['okulist', '👁️', 'blue'],
  ['kinezi', '💪', 'green'], ['reabilit', '💪', 'green'], ['masaž', '💆', 'pink'],
  ['šeimos', '🏥', 'indigo'], ['dakt', '🩺', 'red'], ['gydyt', '🩺', 'red'], ['slaugyt', '🩺', 'red'],
  ['piet', '🍽️', 'orange'], ['kav', '☕', 'orange'], ['autoserv', '🚗', 'blue'], ['servis', '🚗', 'blue'], ['auto', '🚗', 'blue'],
  ['bank', '🏦', 'teal'], ['paštas', '📮', 'orange'], ['mokykl', '🎒', 'green'], ['darželi', '🧸', 'pink'],
  // money out
  ['medžiag', '🧴', 'purple'], ['nuom', '🏠', 'indigo'], ['mokes', '🧾', 'orange'], ['degal', '⛽', 'red'], ['draud', '🛡️', 'blue'], ['reklam', '📣', 'pink'], ['komunal', '💡', 'yellow'],
];
const FALLBACK: GlyphColor[] = ['blue', 'green', 'indigo', 'orange', 'pink', 'purple', 'teal'];

export function glyphFor(name: string): Glyph {
  const n = name.toLocaleLowerCase('lt');
  for (const [stem, glyph, color] of RULES) if (n.includes(stem)) return { glyph, color };
  // no match: the first letter on a colour that stays the same for the same name
  const letter = [...name.trim()][0]?.toLocaleUpperCase('lt') ?? '•';
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { glyph: letter, color: FALLBACK[h % FALLBACK.length]! };
}
