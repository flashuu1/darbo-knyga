import { readFailed } from './failure';
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { db } from '../db/db';
import { repo } from '../db/repo';
import { DEFAULT_SETTINGS } from '../db/seed';
import { backups } from '../db/backups';
import { exportData } from '../logic/backup';
import { backupDue, fingerprint } from '../logic/snapshots';
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
    const sub = liveQuery(q).subscribe({ next: (x) => setV((prev) => (same(prev, x) ? prev : x)), error: (e) => readFailed(e) });
    return () => sub.unsubscribe();
  }, deps);
  return v;
}
export const useSettings = (): Settings => useLive(() => repo.getSettings(), [], DEFAULT_SETTINGS);
export const useServices = (activeOnly = false): Service[] => useLive(() => repo.listServices(activeOnly), [activeOnly], []);
export const useOptions = (group: OptionGroup): Option[] => useLive(() => repo.listOptions(group), [group], []);
/** Due when there is data, and it was never exported or changed since an export over a week ago (not when the books are exactly what the last export holds). */
export const useNeedsBackup = (): boolean =>
  useLive(async () => {
    const [settings, count] = await Promise.all([repo.getSettings(), db.appointments.count()]);
    if (count === 0) return false;
    if (!backupDue(settings.lastBackupAt, true, false)) return false; // backed up this week: nothing to work out
    const last = await backups.latest('export');
    const unchanged = !!last && last.fp === fingerprint(await exportData(db)); // old backup, but are the books still the same as in it?
    return backupDue(settings.lastBackupAt, true, unchanged);
  }, [], false);
/** Whether the books are exactly what a copy holds (by its fingerprint): the list marks that copy. */
export const useBooksFingerprint = (): string => useLive(async () => fingerprint(await exportData(db)), [], '');
