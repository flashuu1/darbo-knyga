import { createStore } from './store';

/** The free-time pill of the week view: which of the best three is shown (0 = the best), and a counter that brings it into view. */
export const freeUi = createStore<{ ri: number; tick: number }>({ ri: 0, tick: 0 });
