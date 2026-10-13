import { useEffect, useState } from 'preact/hooks';
import type { Entry } from '../db/repo';
import { todayStr } from '../logic/time';
import type { Tab } from './components/TabBar';

export interface Store<T> { get(): T; set(p: Partial<T>): void; subscribe(l: () => void): () => void }
export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const ls = new Set<() => void>();
  return {
    get: () => state,
    set: (p) => { state = { ...state, ...p }; ls.forEach((l) => l()); },
    subscribe: (l) => { ls.add(l); return () => { ls.delete(l); }; },
  };
}
export function useStore<T>(s: Store<T>): T {
  const [v, setV] = useState(s.get());
  useEffect(() => s.subscribe(() => setV(s.get())), [s]);
  return v;
}

export type Sheet = { type: 'new'; start: string; clientId?: string; serviceId?: string } | { type: 'appt'; id: string };
export interface ToastState { id: number; text: string; undo?: () => Promise<void> }
export interface DragState { entry: Entry; label: string; x: number; y: number; grabDY: number; left: number; width: number; over: { date: string; start: string } | null }
export interface ActionItem { label: string; role?: 'destructive' | 'cancel'; onPress: () => void }
export interface UiState {
  tab: Tab; view: 'day' | 'week' | 'month'; date: string;
  sheet: Sheet | null; client: string | null; toast: ToastState | null; highlight: string | null;
  drag: DragState | null; action: { title?: string; items: ActionItem[] } | null;
}
export const ui = createStore<UiState>({
  tab: 'calendar', view: 'day', date: todayStr(), sheet: null, client: null, toast: null, highlight: null, drag: null, action: null,
});
export const isBusy = () => { const s = ui.get(); return !!(s.sheet || s.action || s.client || s.drag); };
