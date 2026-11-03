import type { ClientFilter, ClientSort } from '../logic/clientlist';
import { presetWin, type Win } from '../logic/analytics';
import { createStore } from './store';

export type StatTab = 'new' | 'freq' | 'profit' | 'time';
export const STAT_TABS: StatTab[] = ['new', 'freq', 'profit', 'time'];
export interface ClientsUi {
  view: 'list' | 'stats'; filter: ClientFilter; sort: ClientSort; stat: StatTab; win: Win; top: 5 | 10 | 20;
  /** Which way the last page change went (1 = forward, -1 = back), so the new page slides in from that side. */
  dir: -1 | 0 | 1;
}
/** What the Klientai tab shows; it lives outside the screen so it is still there after a visit to another tab. */
export const clientsUi = createStore<ClientsUi>({ view: 'list', filter: 'auto', sort: 'auto', stat: 'new', win: presetWin(12), top: 5, dir: 0 });

/** The pages in the order she swipes through them: the list, then the four analysis pages. */
export const PAGE_COUNT = STAT_TABS.length + 1;
export const pageIndex = (s: Pick<ClientsUi, 'view' | 'stat'>) => (s.view === 'list' ? 0 : 1 + STAT_TABS.indexOf(s.stat));
export function goPage(i: number) {
  const s = clientsUi.get(), cur = pageIndex(s);
  if (i < 0 || i >= PAGE_COUNT || i === cur) return;
  clientsUi.set(i === 0 ? { view: 'list', dir: -1 } : { view: 'stats', stat: STAT_TABS[i - 1]!, dir: i > cur ? 1 : -1 });
}
export const slideClass = (dir: number) => (dir > 0 ? 'slide-in-next' : dir < 0 ? 'slide-in-prev' : '');
