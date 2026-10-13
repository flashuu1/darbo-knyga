import type { Appointment, Client, Service, Settings } from '../db/types';
import type { VizitaiDB } from '../db/db';
import { SCHEMA_VERSION } from '../db/schema';

export interface BackupFile {
  app: 'vizitai'; schemaVersion: number; exportedAt: string;
  clients: Client[]; appointments: Appointment[]; services: Service[]; settings: Settings[];
}
export class BackupError extends Error {
  constructor(public code: 'format' | 'newer') { super(code); }
}

export async function exportData(db: VizitaiDB): Promise<BackupFile> {
  const [clients, appointments, services, settings] = await Promise.all([
    db.clients.toArray(), db.appointments.toArray(), db.services.toArray(), db.settings.toArray(),
  ]);
  return { app: 'vizitai', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), clients, appointments, services, settings };
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
  await db.transaction('rw', db.clients, db.appointments, db.services, db.settings, async () => {
    await Promise.all([db.clients.clear(), db.appointments.clear(), db.services.clear(), db.settings.clear()]);
    await db.clients.bulkAdd(f.clients);
    await db.appointments.bulkAdd(f.appointments);
    await db.services.bulkAdd(f.services);
    await db.settings.bulkAdd(f.settings);
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
