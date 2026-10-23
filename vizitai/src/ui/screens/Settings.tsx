import type { ComponentChildren, CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { SERVICE_COLORS } from '../../db/types';
import { formatBuildTime, formatDayShort } from '../../i18n/format';
import { t, type Key } from '../../i18n/lt';
import { snapClock, todayStr } from '../../logic/time';
import { chooseImport, confirmDeleteService, runBackup, showToast } from '../actions';
import { OptionList } from '../components/OptionList';
import { SwipeRow } from '../components/SwipeRow';
import { useNeedsBackup, useOptions, useServices, useSettings } from '../hooks';
import { BackIcon, BackupIcon, ClockIcon, InfoIcon, NextIcon, PersonIcon, ScissorsIcon, WalletIcon } from '../icons';

type Page = 'services' | 'hours' | 'personal' | 'expenses' | 'backup' | 'about';
const TITLE: Record<Page, Key> = {
  services: 'settings.services', hours: 'settings.hours', personal: 'settings.personal', expenses: 'settings.expenses', backup: 'settings.backup', about: 'settings.about',
};

/** One row of the settings list, like iOS: a coloured tile with an icon, the name, a short value and a chevron. */
function Row({ id, icon, color, label, value, badge, onOpen }: { id: Page; icon: ComponentChildren; color: string; label: string; value?: string; badge?: boolean; onOpen: (p: Page) => void }) {
  return (
    <button class="group-row set-row" data-testid={`settings-row-${id}`} onClick={() => onOpen(id)}>
      <span class="set-ico" style={{ background: `var(--c-${color})` } as CSSProperties} aria-hidden="true">{icon}</span>
      <span class="set-label">{label}</span>
      {value && <span class="set-value" data-testid={`settings-value-${id}`}>{value}</span>}
      {badge && <span class="badge-dot" data-testid={`settings-badge-${id}`} />}
      <span class="chev" aria-hidden="true"><NextIcon /></span>
    </button>
  );
}

export function SettingsScreen() {
  const settings = useSettings();
  const services = useServices(false);
  const personal = useOptions('personal');
  const expenses = useOptions('expense');
  const stale = useNeedsBackup();
  const [page, setPage] = useState<Page | null>(null);
  const [leaving, setLeaving] = useState(false);
  const open = (p: Page) => { setLeaving(false); setPage(p); };
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => { setPage(null); setLeaving(false); }, 230); // the pop-out animation is --t-med (220 ms)
  };
  const lastBackup = settings.lastBackupAt ? formatDayShort(todayStr(new Date(settings.lastBackupAt))) : t('backup.never');

  return (
    <section class="list-screen settings-screen" data-testid="settings">
      <header class="chrome">
        <h1 class="large-title top">{t('tab.settings')}</h1>
      </header>
      <div class="scroll list-body settings-body" data-testid="settings-root">
        <h2 class="section-head">{t('settings.group.calendar')}</h2>
        <div class="group">
          <Row id="services" icon={<ScissorsIcon />} color="blue" label={t('settings.services')} value={String(services.filter((s) => s.active).length)} onOpen={open} />
          <Row id="hours" icon={<ClockIcon />} color="orange" label={t('settings.hours')} value={`${settings.dayStart}–${settings.dayEnd}`} onOpen={open} />
        </div>

        <h2 class="section-head">{t('settings.group.choices')}</h2>
        <div class="group">
          <Row id="personal" icon={<PersonIcon />} color="red" label={t('settings.personal')} value={String(personal.length)} onOpen={open} />
          <Row id="expenses" icon={<WalletIcon />} color="indigo" label={t('settings.expenses')} value={String(expenses.length)} onOpen={open} />
        </div>

        <h2 class="section-head">{t('settings.group.data')}</h2>
        <div class="group">
          <Row id="backup" icon={<BackupIcon />} color="green" label={t('settings.backup')} value={lastBackup} badge={stale} onOpen={open} />
          <Row id="about" icon={<InfoIcon />} color="gray" label={t('settings.about')} onOpen={open} />
        </div>
        <p class="section-foot center">{t('settings.build', { data: formatBuildTime(__BUILD_TIME__), id: __BUILD_ID__ })}</p>
      </div>

      {page && (
        <SubPage title={t(TITLE[page])} id={page} leaving={leaving} onBack={close}>
          {page === 'services' && <ServicesPage />}
          {page === 'hours' && <HoursPage />}
          {page === 'personal' && <OptionList group="personal" />}
          {page === 'expenses' && <OptionList group="expense" />}
          {page === 'backup' && <BackupPage />}
          {page === 'about' && <AboutPage />}
        </SubPage>
      )}
    </section>
  );
}

/** A page pushed over the list: a back button named after the list, a large title, and a swipe from the left edge to go back. */
function SubPage({ title, id, leaving, onBack, children }: { title: string; id: Page; leaving: boolean; onBack: () => void; children: ComponentChildren }) {
  const el = useRef<HTMLDivElement>(null);
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let s: { x: number; y: number } | null = null;
    const start = (e: TouchEvent) => { const p = e.touches[0]!; s = p.clientX < 28 ? { x: p.clientX, y: p.clientY } : null; };
    const end = (e: TouchEvent) => {
      const p = e.changedTouches[0];
      if (s && p && p.clientX - s.x > 70 && Math.abs(p.clientY - s.y) < 60) back.current();
      s = null;
    };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchend', end, { passive: true });
    return () => { node.removeEventListener('touchstart', start); node.removeEventListener('touchend', end); };
  }, []);
  return (
    <div ref={el} class={leaving ? 'set-page pop-out' : 'set-page push-in'} data-testid={`settings-page-${id}`}>
      <header class="chrome">
        <div class="navbar">
          <button class="nav-btn back" data-testid="settings-back" onClick={onBack}><BackIcon /><span>{t('tab.settings')}</span></button>
        </div>
        <h1 class="large-title">{title}</h1>
      </header>
      <div class="scroll list-body settings-body">{children}</div>
    </div>
  );
}

// Short services go in quarter hours; long ones (a wedding takes hours) in half hours, up to 14 hours.
const MAX_SERVICE_MIN = 840;
const stepFor = (minutes: number) => (minutes < 120 ? 15 : 30);

function ServicesPage() {
  const services = useServices(false);
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  async function toggle(id: string, active: boolean) {
    try { await repo.setServiceActive(id, active); } catch { showToast(t('service.lastActive')); }
  }
  async function renameService(id: string, name: string) {
    try { await repo.updateService(id, { name }); } catch (e) { console.error(e); }
    setTick((x) => x + 1); // remount the input so it shows the stored name (a blank edit is ignored)
  }
  return (
    <>
      <ul class="group svc-list">
        {services.map((s, i) => (
          <li key={s.id} data-testid={`svc-row-${i}`} class={s.active ? '' : 'hidden-svc'}>
            <SwipeRow testId={`svc-swipe-${i}`} onDelete={() => confirmDeleteService(s)}>
              <div class="svc-line">
                <button class="swatch" data-testid={`svc-swatch-${i}`} aria-expanded={openColor === s.id} onClick={() => setOpenColor(openColor === s.id ? null : s.id)}>
                  <span class="dot" style={{ background: `var(--c-${s.color})` } as CSSProperties} />
                </button>
                <input class="inline" data-testid={`svc-name-${i}`} defaultValue={s.name} key={`${s.id}${s.name}${tick}`} autocomplete="off"
                  onChange={(e) => void renameService(s.id, (e.target as HTMLInputElement).value)} />
                <button class="icon-btn" data-testid={`svc-up-${i}`} disabled={i === 0} onClick={() => void repo.moveService(s.id, -1)}>↑</button>
                <button class="icon-btn" data-testid={`svc-down-${i}`} disabled={i === services.length - 1} onClick={() => void repo.moveService(s.id, 1)}>↓</button>
              </div>
              <div class="svc-line sub">
                <span class="sub-label">{t('service.minutes')}</span>
                <span class="stepper">
                  <button data-testid={`svc-minus-${i}`} disabled={s.minutes <= 15} onClick={() => void repo.updateService(s.id, { minutes: Math.max(15, s.minutes - stepFor(s.minutes - 1)) })}>−</button>
                  <span class="stepper-val" data-testid={`svc-minutes-${i}`}>{s.minutes}</span>
                  <button data-testid={`svc-plus-${i}`} disabled={s.minutes >= MAX_SERVICE_MIN} onClick={() => void repo.updateService(s.id, { minutes: Math.min(MAX_SERVICE_MIN, s.minutes + stepFor(s.minutes)) })}>+</button>
                </span>
                <button class="toggle" data-testid={`svc-toggle-${i}`} onClick={() => void toggle(s.id, !s.active)}>{s.active ? t('service.hide') : t('service.show')}</button>
              </div>
              <div class="svc-line sub">
                <span class="sub-label">{t('service.floral')} 🌸</span>
                <button class={s.floral ? 'switch on' : 'switch'} role="switch" aria-checked={s.floral === true} aria-label={t('service.floral')} data-testid={`svc-floral-${i}`}
                  onClick={() => void repo.updateService(s.id, { floral: !s.floral })}><span class="knob" /></button>
              </div>
              {openColor === s.id && (
                <div class="svc-line swatches">
                  {SERVICE_COLORS.map((c) => (
                    <button key={c} class={c === s.color ? 'swatch on' : 'swatch'} data-testid={`svc-color-${i}-${c}`}
                      onClick={() => { void repo.updateService(s.id, { color: c }); setOpenColor(null); }}>
                      <span class="dot" style={{ background: `var(--c-${c})` } as CSSProperties} />
                    </button>
                  ))}
                </div>
              )}
            </SwipeRow>
          </li>
        ))}
      </ul>
      <div class="group">
        <button class="group-row accent" data-testid="svc-add" onClick={() => void repo.addService(t('service.new'))}>{t('service.add')}</button>
      </div>
    </>
  );
}

function HoursPage() {
  const settings = useSettings();
  const [tick, setTick] = useState(0);
  async function setHour(field: 'dayStart' | 'dayEnd', raw: string) {
    if (!raw) return;
    const v = snapClock(raw);
    if (v !== raw) setTick((x) => x + 1); // remount so the field shows the snapped value even if it is unchanged
    const next = { ...settings, [field]: v };
    if (next.dayStart >= next.dayEnd) { showToast(t('hours.invalid')); setTick((x) => x + 1); return; }
    try { await repo.updateSettings({ [field]: v }); } catch (e) { console.error(e); }
  }
  return (
    <div class="group">
      <label class="group-row"><span>{t('hours.start')}</span>
        <input class="inline time" type="time" step={900} key={`s${settings.dayStart}${tick}`} defaultValue={settings.dayStart} data-testid="hours-start" onChange={(e) => void setHour('dayStart', (e.target as HTMLInputElement).value)} /></label>
      <label class="group-row"><span>{t('hours.end')}</span>
        <input class="inline time" type="time" step={900} key={`e${settings.dayEnd}${tick}`} defaultValue={settings.dayEnd} data-testid="hours-end" onChange={(e) => void setHour('dayEnd', (e.target as HTMLInputElement).value)} /></label>
    </div>
  );
}

function BackupPage() {
  const settings = useSettings();
  const file = useRef<HTMLInputElement>(null);
  const last = settings.lastBackupAt ? t('backup.last', { data: formatDayShort(todayStr(new Date(settings.lastBackupAt))) }) : t('backup.never');
  return (
    <>
      <div class="group">
        <button class="group-row accent" data-testid="btn-export" onClick={() => void runBackup()}>{t('backup.export')}</button>
        <button class="group-row accent" data-testid="btn-import" onClick={() => file.current?.click()}>{t('backup.import')}</button>
      </div>
      <p class="section-foot" data-testid="backup-last">{last}</p>
      <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-input"
        onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void chooseImport(f); }} />
    </>
  );
}

function AboutPage() {
  const settings = useSettings();
  return (
    <>
      <h2 class="section-head">{t('settings.storage')}</h2>
      <div class="group">
        <p class="group-row text" data-testid="storage-status">{settings.persistGranted ? t('storage.persistent') : t('storage.notPersistent')}</p>
      </div>
      <p class="section-foot center" data-testid="app-version">{t('settings.version')}: {__APP_VERSION__}</p>
      <p class="section-foot center" data-testid="app-build">{t('settings.build', { data: formatBuildTime(__BUILD_TIME__), id: __BUILD_ID__ })}</p>
    </>
  );
}
