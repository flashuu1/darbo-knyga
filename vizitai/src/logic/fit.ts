/**
 * How much of an entry fits, from the entry's OWN height in px (its length in time times the row height), not from the
 * zoom of the whole calendar: a two-hour visit stays readable when a 15-minute one next to it is only a sliver.
 *   xs  < 12 px   a sliver: colour only
 *   x   < 20 px   the name alone on one line, tiny
 *   s   < 30 px   the name alone on one line
 *   m   < 40 px (one-line entries) / 54 px (stacked ones)   time and name on one line, no service
 *   l   the whole card
 */
export type Fit = 'xs' | 'x' | 's' | 'm' | 'l';
export function fitFor(heightPx: number, oneLine: boolean): Fit {
  if (heightPx < 12) return 'xs';
  if (heightPx < 20) return 'x';
  if (heightPx < 30) return 's';
  if (heightPx < (oneLine ? 40 : 54)) return 'm';
  return 'l';
}
