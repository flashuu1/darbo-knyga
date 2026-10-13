import type { Appointment, Client, Option, Service, Settings } from '../db/types';
import type { VizitaiDB } from '../db/db';
import { SCHEMA_VERSION } from '../db/schema';
import { DEFAULT_SETTINGS } from '../db/seed';

export interface BackupFile {
  app: 'vizitai'; schemaVersion: number; exportedAt: string;
  clients: Client[]; appointments: Appointment[]; services: Service[]; settings: Settings[];
  /** Absent in files made before personal/expense choices existed. */
  options?: Option[];
}
export class BackupError extends Error {
  constructor(public code: 'format' | 'newer') { super(code); }
}

export async function exportData(db: VizitaiDB): Promise<BackupFile> {
  const [clients, appointments, services, settings, options] = await Promise.all([
    db.clients.toArray(), db.appointments.toArray(), db.services.toArray(), db.settings.toArray(), db.options.toArray(),
  ]);
  return { app: 'vizitai', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), clients, appointments, services, settings, options };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new BackupError('format'); }
  const f = data as Partial<BackupFile> | null;
  if (!f || f.app !== 'vizitai' || typeof f.schemaVersion !== 'number' ||
      !Array.isArray(f.clients) || !Array.isArray(f.appointments) || !Array.isArray(f.services) || !Array.isArray(f.settings)) {
    throw new BackupError('format');
  }
  if (f.schemaVersion > SCHEMA_VERSION) throw new BackupError('newer');
  return f as BackupFile;
}

export async function importData(db: VizitaiDB, f: BackupFile): Promise<void> {
  await db.transaction('rw', db.clients, db.appointments, db.services, db.settings, db.options, async () => {
    // persistGranted describes this device's storage, not the file's: keep the local value.
    const persistGranted = (await db.settings.get('settings'))?.persistGranted ?? null;
    // A file without the settings record would make ensureSeed add the six default services again.
    const settings = f.settings.some((s) => s.id === 'settings') ? f.settings : [...f.settings, { ...DEFAULT_SETTINGS }];
    await Promise.all([db.clients.clear(), db.appointments.clear(), db.services.clear(), db.settings.clear(), db.options.clear()]);
    await db.clients.bulkAdd(f.clients);
    await db.appointments.bulkAdd(f.appointments);
    await db.services.bulkAdd(f.services);
    await db.options.bulkAdd(Array.isArray(f.options) ? f.options : []); // an older file has none
    await db.settings.bulkAdd(settings.map((s) => (s.id === 'settings' ? { ...s, persistGranted } : s)));
  });
}

export function backupFileName(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `vizitai-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export async function shareBackup(json: string, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // revoking at once cancels the download in Safari/Firefox
  return 'downloaded';
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
export function needsBackup(lastBackupAt: string | null, hasData: boolean, now: Date = new Date()): boolean {
  if (!hasData) return false;
  if (!lastBackupAt) return true;
  return now.getTime() - new Date(lastBackupAt).getTime() > WEEK_MS;
}
