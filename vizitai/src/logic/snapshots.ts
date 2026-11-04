import type { BackupFile } from './backup';

/** JSON with the keys of every object in a fixed order, so the same data always reads the same. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}
// A fast 53-bit string hash (cyrb53): enough to tell two sets of data apart, not a security measure.
function hash53(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
type Data = Pick<BackupFile, 'clients' | 'appointments' | 'services' | 'settings'> & { options?: BackupFile['options'] };
const byId = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

/**
 * What the data IS, ignoring when it was exported and ignoring what only describes this phone or this backup
 * (`lastBackupAt`, `persistGranted`). Two files with the same fingerprint hold the same books: nothing to export again,
 * nothing to restore.
 */
export function fingerprint(f: Data): string {
  const settings = byId(f.settings).map((s) => ({ ...s, lastBackupAt: null, persistGranted: null }));
  const body = stableStringify({ c: byId(f.clients), a: byId(f.appointments), s: byId(f.services), o: byId(f.options ?? []), t: settings });
  return `${hash53(body)}-${body.length.toString(36)}`;
}
export interface SnapCounts { clients: number; visits: number }
/** Clients and client visits, for the line under a copy in the list. */
export const countsOf = (f: Pick<BackupFile, 'clients' | 'appointments'>): SnapCounts =>
  ({ clients: f.clients.length, visits: f.appointments.filter((a) => a.kind === 'client' && a.status !== 'cancelled').length });

const WEEK_MS = 7 * 24 * 3600 * 1000;
/**
 * Is a backup due? Not when there is nothing to lose, and not when the books are exactly what the last export holds
 * (however long ago that was); otherwise when there never was one or the last is over a week old.
 */
export function backupDue(lastBackupAt: string | null, hasData: boolean, unchangedSinceExport: boolean, now: Date = new Date()): boolean {
  if (!hasData || unchangedSinceExport) return false;
  if (!lastBackupAt) return true;
  return now.getTime() - new Date(lastBackupAt).getTime() > WEEK_MS;
}
