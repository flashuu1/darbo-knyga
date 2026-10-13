import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { repo } from '../db/repo';
import { DEFAULT_SETTINGS } from '../db/seed';
import type { Service, Settings } from '../db/types';

export function useLive<T>(q: () => T | Promise<T>, deps: unknown[], initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(q).subscribe({ next: setV, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return v;
}
export const useSettings = (): Settings => useLive(() => repo.getSettings(), [], DEFAULT_SETTINGS);
export const useServices = (activeOnly = false): Service[] => useLive(() => repo.listServices(activeOnly), [activeOnly], []);
