import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { db } from '../db/db';
import { repo } from '../db/repo';
import { DEFAULT_SETTINGS } from '../db/seed';
import { needsBackup } from '../logic/backup';
import type { Option, OptionGroup, Service, Settings } from '../db/types';

// Any write re-runs every live query that reads the table; most come back unchanged, and a re-render of the
// calendar for identical data is wasted work, so an equal result keeps the previous value (no render).
// JSON.stringify sees a Map or Set as empty, so they are turned into arrays first
const plain = (_k: string, v: unknown) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : v);
const same = (a: unknown, b: unknown) => {
  if (Object.is(a, b)) return true;
  try { return JSON.stringify(a, plain) === JSON.stringify(b, plain); } catch { return false; }
};
export function useLive<T>(q: () => T | Promise<T>, deps: unknown[], initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(q).subscribe({ next: (x) => setV((prev) => (same(prev, x) ? prev : x)), error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return v;
}
export const useSettings = (): Settings => useLive(() => repo.getSettings(), [], DEFAULT_SETTINGS);
export const useServices = (activeOnly = false): Service[] => useLive(() => repo.listServices(activeOnly), [activeOnly], []);
export const useOptions = (group: OptionGroup): Option[] => useLive(() => repo.listOptions(group), [group], []);
export const useNeedsBackup = (): boolean =>
  useLive(async () => needsBackup((await repo.getSettings()).lastBackupAt, (await db.appointments.count()) > 0), [], false);
