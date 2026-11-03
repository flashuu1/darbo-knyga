import { presetWin, type Win } from '../logic/analytics';
import { createStore } from './store';

export type StatTab = 'new' | 'freq' | 'profit' | 'time';
export const STAT_TABS: StatTab[] = ['new', 'freq', 'profit', 'time'];
export interface StatsUi {
  /** Išlaidos shows its month ('main') or the analysis ('stats'). */
  view: 'main' | 'stats'; stat: StatTab; win: Win; top: 5 | 10 | 20;
  /** Which way the last page change went (1 = forward, -1 = back), so the new page slides in from that side. */
  dir: -1 | 0 | 1;
}
/** What Išlaidos > Analizė shows; kept outside the screen so it is still there after a visit to another tab. */
export const statsUi = createStore<StatsUi>({ view: 'main', stat: 'new', win: presetWin(12), top: 5, dir: 0 });

/** The pages in the order she swipes through them: the month, then the four analysis pages. */
export const PAGE_COUNT = STAT_TABS.length + 1;
export const pageIndex = (s: Pick<StatsUi, 'view' | 'stat'>) => (s.view === 'main' ? 0 : 1 + STAT_TABS.indexOf(s.stat));
export function goPage(i: number) {
  const s = statsUi.get(), cur = pageIndex(s);
  if (i < 0 || i >= PAGE_COUNT || i === cur) return;
  statsUi.set(i === 0 ? { view: 'main', dir: -1 } : { view: 'stats', stat: STAT_TABS[i - 1]!, dir: i > cur ? 1 : -1 });
}
export const slideClass = (dir: number) => (dir > 0 ? 'slide-in-next' : dir < 0 ? 'slide-in-prev' : '');
