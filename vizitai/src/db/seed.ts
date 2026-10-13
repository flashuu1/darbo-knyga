import { t } from '../i18n/lt';
import type { Service, Settings } from './types';
import type { VizitaiDB } from './db';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings', dayStart: '08:00', dayEnd: '20:00', slotMinutes: 15, lastBackupAt: null, persistGranted: null,
};

export async function ensureSeed(db: VizitaiDB): Promise<void> {
  await db.transaction('rw', db.settings, db.services, async () => {
    if (await db.settings.get('settings')) return; // seeded once; hiding services never re-seeds
    const defs: Omit<Service, 'id' | 'order' | 'active'>[] = [
      { name: t('service.default.cut'), color: 'blue', minutes: 45 },
      { name: t('service.default.color'), color: 'pink', minutes: 90 },
      { name: t('service.default.cutColor'), color: 'purple', minutes: 120 },
      { name: t('service.default.highlights'), color: 'orange', minutes: 120 },
      { name: t('service.default.style'), color: 'green', minutes: 60 },
      { name: t('service.default.other'), color: 'gray', minutes: 30 },
    ];
    await db.services.bulkAdd(defs.map((d, i) => ({ ...d, id: crypto.randomUUID(), order: i, active: true })));
    await db.settings.add({ ...DEFAULT_SETTINGS });
  });
}
