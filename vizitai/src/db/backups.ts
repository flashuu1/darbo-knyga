import Dexie, { type Table } from 'dexie';
import { countsOf, fingerprint, type SnapCounts } from '../logic/snapshots';
import type { BackupFile } from '../logic/backup';
import { newId } from '../logic/id';

/**
 * Copies of the books kept inside the app, so a copy can be restored from a list without picking a file.
 *  - `export`: what she exported to Files (the file in Atsisiuntimai is the real safety; the app cannot see that folder, it keeps
 *     its own copy of what it handed over). The last 3.
 *  - `auto`: one a day, taken by the app itself when the books changed (the first time she opens it each day). The last 3.
 *  - `safety`: taken just before a restore or an import replaces the books, so it can be undone. The last 1.
 * They live in their own database so that replacing the books never touches them. They share the phone's storage though:
 * if iOS clears the app's data, they go with it, which is why the exported file matters.
 */
export type SnapKind = 'export' | 'auto' | 'safety';
export interface Snap { id: string; kind: SnapKind; /** when this exact data was saved or last exported (ISO) */ at: string; fp: string; counts: SnapCounts; bytes: number; json: string }
export const KEEP: Record<SnapKind, number> = { export: 3, auto: 3, safety: 1 };

export class BackupsDB extends Dexie {
  snaps!: Table<Snap, string>;
  constructor(name = 'vizitai-backups') {
    super(name);
    this.version(1).stores({ snaps: 'id, kind, at' });
  }
}

export function createBackups(db: BackupsDB) {
  const prune = async (kind: SnapKind) => {
    const all = await db.snaps.where('kind').equals(kind).toArray();
    const drop = all.sort((a, b) => b.at.localeCompare(a.at)).slice(KEEP[kind]).map((s) => s.id);
    if (drop.length) await db.snaps.bulkDelete(drop);
  };
  return {
    /** Newest first. */
    async list(kind: SnapKind): Promise<Snap[]> { return (await db.snaps.where('kind').equals(kind).toArray()).sort((a, b) => b.at.localeCompare(a.at)); },
    get: (id: string) => db.snaps.get(id),
    /** The newest copy of any kind. */
    async latestAny(): Promise<Snap | undefined> { return (await db.snaps.toArray()).sort((a, b) => b.at.localeCompare(a.at))[0]; },
    async latest(kind: SnapKind): Promise<Snap | undefined> { return (await this.list(kind))[0]; },
    /**
     * Keeps a copy. The same data twice is not kept twice: a copy of this kind that already holds exactly these books is only
     * given the new time; for `auto`, nothing is saved when ANY copy already holds them. Returns the copy and whether it is new.
     */
    async save(kind: SnapKind, file: BackupFile, json: string, at: string = new Date().toISOString()): Promise<{ snap: Snap; created: boolean }> {
      const fp = fingerprint(file);
      const same = (await this.list(kind)).find((s) => s.fp === fp);
      if (same) { const snap = { ...same, at }; await db.snaps.put(snap); return { snap, created: false }; }
      if (kind === 'auto') { const any = await this.latestAny(); if (any && any.fp === fp) return { snap: any, created: false }; }
      const snap: Snap = { id: newId(), kind, at, fp, counts: countsOf(file), bytes: json.length, json };
      await db.snaps.add(snap);
      await prune(kind);
      return { snap, created: true };
    },
    remove: (id: string) => db.snaps.delete(id),
  };
}
export const backupsDb = new BackupsDB();
export const backups = createBackups(backupsDb);
export type Backups = ReturnType<typeof createBackups>;
