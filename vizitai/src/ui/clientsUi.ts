import type { ClientFilter, ClientSort } from '../logic/clientlist';
import { presetWin, type Win } from '../logic/analytics';
import { createStore } from './store';

export type StatTab = 'new' | 'freq' | 'profit' | 'time';
export interface ClientsUi {
  view: 'list' | 'stats'; filter: ClientFilter; sort: ClientSort; stat: StatTab; win: Win; top: 5 | 10 | 20;
}
/** What the Klientai tab shows; it lives outside the screen so it is still there after a visit to another tab. */
export const clientsUi = createStore<ClientsUi>({ view: 'list', filter: 'auto', sort: 'auto', stat: 'new', win: presetWin(12), top: 5 });
