import type { ClientFilter, ClientSort } from '../logic/clientlist';
import { createStore } from './store';

export interface ClientsUi { filter: ClientFilter; sort: ClientSort }
/** What the Klientai list shows; it lives outside the screen so it is still there after a visit to another tab. */
export const clientsUi = createStore<ClientsUi>({ filter: 'auto', sort: 'auto' });
