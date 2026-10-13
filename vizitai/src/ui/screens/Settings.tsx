import type { CSSProperties } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { SERVICE_COLORS } from '../../db/types';
import { formatDayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { todayStr } from '../../logic/time';
import { chooseImport, runBackup, showToast } from '../actions';
import { useServices, useSettings } from '../hooks';

export function SettingsScreen() {
  const settings = useSettings();
  const services = useServices(false);
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const file = useRef<HTMLInputElement>(null);

  async function toggle(id: string, active: boolean) {
    try { await repo.setServiceActive(id, active); } catch { showToast(t('service.lastActive')); }
  }
  async function setHour(field: 'dayStart' | 'dayEnd', v: string) {
    if (!v) return;
    const next = { ...settings, [field]: v };
    if (next.dayStart >= next.dayEnd) { showToast(t('hours.invalid')); setTick((x) => x + 1); return; }
    try { await repo.updateSettings({ [field]: v }); } catch (e) { console.error(e); }
  }
  const last = settings.lastBackupAt ? t('backup.last', { data: formatDayShort(todayStr(new Date(settings.lastBackupAt))) }) : t('backup.never');

  return (
    <section class="settings" data-testid="settings">
      <h1 class="large-title">{t('tab.settings')}</h1>
      <div class="settings-body">
        <p class="label">{t('settings.services')}</p>
        <ul class="svc-list">
          {services.map((s, i) => (
            <li key={s.id} data-testid={`svc-row-${i}`} class={s.active ? '' : 'hidden-svc'}>
              <div class="svc-line">
                <button class="swatch" style={{ background: `var(--c-${s.color})` } as CSSProperties} data-testid={`svc-swatch-${i}`} onClick={() => setOpenColor(openColor === s.id ? null : s.id)} />
                <input class="inline" data-testid={`svc-name-${i}`} defaultValue={s.name} key={`${s.id}${s.name}`}
                  onChange={(e) => void repo.updateService(s.id, { name: (e.target as HTMLInputElement).value })} />
                <button data-testid={`svc-up-${i}`} onClick={() => void repo.moveService(s.id, -1)}>↑</button>
                <button data-testid={`svc-down-${i}`} onClick={() => void repo.moveService(s.id, 1)}>↓</button>
              </div>
              <div class="svc-line sub">
                <span class="label">{t('service.minutes')}</span>
                <button data-testid={`svc-minus-${i}`} onClick={() => void repo.updateService(s.id, { minutes: Math.max(15, s.minutes - 15) })}>−</button>
                <span data-testid={`svc-minutes-${i}`}>{s.minutes}</span>
                <button data-testid={`svc-plus-${i}`} onClick={() => void repo.updateService(s.id, { minutes: Math.min(240, s.minutes + 15) })}>+</button>
                <button class="toggle" data-testid={`svc-toggle-${i}`} onClick={() => void toggle(s.id, !s.active)}>{s.active ? t('service.hide') : t('service.show')}</button>
              </div>
              {openColor === s.id && (
                <div class="svc-line swatches">
                  {SERVICE_COLORS.map((c) => (
                    <button key={c} class="swatch" style={{ background: `var(--c-${c})` } as CSSProperties} data-testid={`svc-color-${i}-${c}`}
                      onClick={() => { void repo.updateService(s.id, { color: c }); setOpenColor(null); }} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        <button class="action-row" data-testid="svc-add" onClick={() => void repo.addService(t('service.new'))}>{t('service.add')}</button>

        <p class="label">{t('settings.hours')}</p>
        <div class="row"><span class="label">{t('hours.start')}</span>
          <input class="inline" type="time" step={900} key={`s${settings.dayStart}${tick}`} defaultValue={settings.dayStart} data-testid="hours-start" onChange={(e) => void setHour('dayStart', (e.target as HTMLInputElement).value)} /></div>
        <div class="row"><span class="label">{t('hours.end')}</span>
          <input class="inline" type="time" step={900} key={`e${settings.dayEnd}${tick}`} defaultValue={settings.dayEnd} data-testid="hours-end" onChange={(e) => void setHour('dayEnd', (e.target as HTMLInputElement).value)} /></div>

        <p class="label">{t('settings.backup')}</p>
        <p class="muted-left" data-testid="backup-last">{last}</p>
        <div class="actions-list">
          <button class="action-row" data-testid="btn-export" onClick={() => void runBackup()}>{t('backup.export')}</button>
          <button class="action-row" data-testid="btn-import" onClick={() => file.current?.click()}>{t('backup.import')}</button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-input"
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void chooseImport(f); }} />

        <p class="label">{t('settings.storage')}</p>
        <p class="muted-left" data-testid="storage-status">{settings.persistGranted ? t('storage.persistent') : t('storage.notPersistent')}</p>
        <p class="muted-left" data-testid="app-version">{t('settings.version')}: {__APP_VERSION__}</p>
      </div>
    </section>
  );
}
