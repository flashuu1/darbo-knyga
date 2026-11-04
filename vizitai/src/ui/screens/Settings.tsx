import type { ComponentChildren, CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { SERVICE_COLORS } from '../../db/types';
import { formatBuildTime, formatDayShort, weekdayAbbr, weekdayName } from '../../i18n/format';
import { t, type Key } from '../../i18n/lt';
import { nowLocal, snapClock, todayStr } from '../../logic/time';
import { chooseImport, removeService, restoreSnapshot, runBackup, showToast } from '../actions';
import { backups, type Snap } from '../../db/backups';
import { Changelog } from '../components/Changelog';
import { AddSlotContext, Dur, DurationEditor, EditList, Switch, type AddSlot } from '../components/EditList';
import { OptionList } from '../components/OptionList';
import { useBooksFingerprint, useLive, useNeedsBackup, useOptions, useServices, useSettings } from '../hooks';
import { useKeyboardHeight } from '../keyboard';
import { useSwipeBack } from '../swipeBack';
import { BackIcon, BackupIcon, CheckIcon, ClockIcon, InfoIcon, NextIcon, PersonIcon, PlusIcon, RepeatIcon, ScissorsIcon, WalletIcon } from '../icons';

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
  const closeNow = () => { setPage(null); setLeaving(false); }; // after a swipe the page is already off the screen
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
        <SubPage title={t(TITLE[page])} id={page} leaving={leaving} onBack={close} onSwiped={closeNow}>
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

/** A page pushed over the list: a back button named after the list, a large title, and a swipe to the right (the page follows the finger) to go back. */
const ADD_TEST: Partial<Record<Page, string>> = { services: 'svc-add', personal: 'opt-personal-add', expenses: 'opt-expense-add' };
function SubPage({ title, id, leaving, onBack, onSwiped, children }: { title: string; id: Page; leaving: boolean; onBack: () => void; onSwiped: () => void; children: ComponentChildren }) {
  const el = useRef<HTMLDivElement>(null);
  const kb = useKeyboardHeight();
  const kbRef = useRef(kb);
  kbRef.current = kb;
  const back = useRef(onBack);
  back.current = onBack;
  // Tapping a field (or one being focused for her) brings it into view above the keyboard, once the keyboard is up
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let timer = 0;
    const focused = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      clearTimeout(timer);
      // the keyboard covers the bottom of the screen without resizing the page: scroll just enough to put the field above it
      timer = window.setTimeout(() => {
        const body = node.querySelector<HTMLElement>('.settings-body');
        if (!body) return;
        const r = t.getBoundingClientRect(), top = body.getBoundingClientRect().top + 8;
        const limit = window.innerHeight - kbRef.current - (kbRef.current > 0 ? 64 : 24); // 64: the strip above the keyboard
        const delta = r.bottom > limit ? r.bottom - limit : r.top < top ? r.top - top : 0;
        if (Math.abs(delta) > (t.closest('.cost') ? 24 : 0)) body.scrollBy({ top: delta, behavior: 'smooth' }); // the fixed amount was already put in place when the row opened: only a real miss is corrected
      }, 320);
    };
    node.addEventListener('focusin', focused);
    return () => { clearTimeout(timer); node.removeEventListener('focusin', focused); };
  }, []);
  const [add, setAdd] = useState<AddSlot | null>(null); // what the list on this page adds: the "+" at the top right
  const touchY = useRef(0); // dragging the page with the keyboard up puts the keyboard away, like iOS lists
  useSwipeBack(el, onSwiped); // swipe to the right anywhere: the page follows the finger back to the list
  return (
    <div ref={el} class={leaving ? 'set-page pop-out' : 'set-page push-in'} data-testid={`settings-page-${id}`} style={{ '--kb': `${kb}px` } as CSSProperties}>
      <header class="chrome">
        <div class="navbar">
          <button class="nav-btn back" data-testid="settings-back" onClick={onBack}><BackIcon /><span>{t('tab.settings')}</span></button>
          {add && <button class="add-btn press" data-testid={ADD_TEST[id]} aria-label={add.label} onClick={add.run}><PlusIcon /></button>}
        </div>
        <h1 class="large-title">{title}</h1>
      </header>
      <div class="scroll list-body settings-body" onTouchStart={(e) => { touchY.current = e.touches[0]!.clientY; }}
        onTouchMove={(e) => { const a = document.activeElement; if (a instanceof HTMLInputElement && Math.abs(e.touches[0]!.clientY - touchY.current) > 10) a.blur(); }}><AddSlotContext.Provider value={setAdd}>{children}</AddSlotContext.Provider></div>
    </div>
  );
}

const MAX_SERVICE_MIN = 840;

/** Paslaugos: one row per service (colour, name, length); a tap opens it: name, length, colour, shown or hidden, order, delete. */
function ServicesPage() {
  const services = useServices(false);
  async function toggle(id: string, active: boolean) {
    try { await repo.setServiceActive(id, active); } catch { showToast(t('service.lastActive')); }
  }
  const by = (id: string) => services.find((s) => s.id === id)!;
  return (
    <EditList prefix="svc" addLabel={t('service.add')} note={t('service.note')}
      items={services.map((s) => ({ id: s.id, name: s.name, tint: `var(--c-${s.color})`, lead: <span class="er-dot" />, value: <Dur m={s.minutes} />, off: !s.active }))}
      onAdd={async () => (await repo.addService(t('service.new'))).id}
      onRename={async (id, name) => { try { await repo.updateService(id, { name }); } catch (e) { console.error(e); } }}
      onReorder={(ids) => repo.reorderServices(ids)}
      onRemove={(id) => removeService(by(id))}
      extra={(id, i) => <span class="er-switch"><Switch on={by(id).active} label={t('edit.shown')} testId={`svc-toggle-${i}`} onChange={(on) => void toggle(id, on)} />{t('edit.shown')}</span>}
      editor={(id, i) => {
        const s = by(id);
        return (
          <>
            <DurationEditor prefix="svc" i={i} minutes={s.minutes} max={MAX_SERVICE_MIN} onChange={(m) => void repo.updateService(id, { minutes: m })} />
            <div class="ed-lab">{t('edit.color')}</div>
            <div class="er-colors">
              {SERVICE_COLORS.map((c) => (
                <button key={c} class={c === s.color ? 'swatch on' : 'swatch'} aria-label={c} aria-pressed={c === s.color} data-testid={`svc-color-${i}-${c}`} style={{ '--sc': `var(--c-${c})` } as CSSProperties}
                  onClick={() => void repo.updateService(id, { color: c })}><span class="dot" /></button>
              ))}
            </div>
          </>
        );
      }} />
  );
}

let dayChain: Promise<void> = Promise.resolve();
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
  const days = settings.workDays ?? [0, 1, 2, 3, 4, 5, 6];
  // Each tap reads what is saved (not what was last drawn), one after another, so quick taps never undo each other
  function toggleDay(i: number) {
    dayChain = dayChain.then(async () => {
      const cur = (await repo.getSettings()).workDays ?? [0, 1, 2, 3, 4, 5, 6];
      const next = cur.includes(i) ? cur.filter((d) => d !== i) : [...cur, i].sort();
      if (next.length === 0) return; // at least one day stays
      await repo.updateSettings({ workDays: next });
    }).catch((e) => console.error(e));
  }
  return (
    <>
    <div class="group">
      <label class="group-row"><span>{t('hours.start')}</span>
        <input class="inline time" type="time" step={900} key={`s${settings.dayStart}${tick}`} defaultValue={settings.dayStart} data-testid="hours-start" onChange={(e) => void setHour('dayStart', (e.target as HTMLInputElement).value)} /></label>
      <label class="group-row"><span>{t('hours.end')}</span>
        <input class="inline time" type="time" step={900} key={`e${settings.dayEnd}${tick}`} defaultValue={settings.dayEnd} data-testid="hours-end" onChange={(e) => void setHour('dayEnd', (e.target as HTMLInputElement).value)} /></label>
    </div>
    <h2 class="section-head">{t('hours.days')}</h2>
    <div class="days-row" data-testid="work-days">
      {Array.from({ length: 7 }, (_, i) => (
        <button key={i} class={days.includes(i) ? 'day-btn on' : 'day-btn'} aria-pressed={days.includes(i)} aria-label={t('hours.dayAria', { diena: weekdayName(i).toLowerCase() })}
          data-testid={`work-day-${i}`} onClick={() => toggleDay(i)}>{weekdayAbbr(i)}</button>
      ))}
    </div>
    <p class="section-foot">{t('hours.daysNote')}</p>
    </>
  );
}

function BackupPage() {
  const settings = useSettings();
  const file = useRef<HTMLInputElement>(null);
  const exports = useLive(() => backups.list('export'), [], [] as Snap[]);
  const autos = useLive(async () => [...(await backups.list('auto')), ...(await backups.list('safety'))].sort((a, b) => b.at.localeCompare(a.at)), [], [] as Snap[]);
  const now = useBooksFingerprint();
  const last = settings.lastBackupAt ? t('backup.last', { data: formatDayShort(todayStr(new Date(settings.lastBackupAt))) }) : t('backup.never');
  const same = !!exports[0] && exports[0].fp === now;
  const head = same ? t('backup.statusOk') : settings.lastBackupAt ? t('backup.statusOld') : t('backup.statusNone');
  const row = (s: Snap, kind: string, i: number) => (
    <button key={s.id} class="group-row snap-row rise" style={{ '--i': i } as CSSProperties} data-testid={`snap-${kind}-${i}`} onClick={() => void restoreSnapshot(s)}>
      <span class={s.fp === now ? 'snap-ico on' : 'snap-ico'} aria-hidden="true">{s.fp === now ? <CheckIcon /> : s.kind === 'safety' ? <RepeatIcon /> : <BackupIcon />}</span>
      <span class="snap-text">
        <b>{formatDayShort(todayStr(new Date(s.at)))}, {nowLocal(new Date(s.at)).slice(11, 16)}{s.kind === 'safety' ? ` · ${t('backup.safetyTag')}` : ''}</b>
        <span>{t('backup.snapLine', { k: s.counts.clients, v: s.counts.visits, kb: Math.max(1, Math.round(s.bytes / 1024)) })}</span>
      </span>
      {s.fp === now ? <span class="snap-match" data-testid={`snap-match-${kind}-${i}`}>{t('backup.matches')}</span> : <span class="snap-go" aria-hidden="true">{t('backup.restore')}</span>}
    </button>
  );
  return (
    <>
      <div class={same ? 'bk-status ok rise' : 'bk-status rise'} data-testid="backup-status">
        <span class="bk-ico" aria-hidden="true">{same ? <CheckIcon /> : <BackupIcon />}</span>
        <div class="bk-text">
          <b>{head}</b>
          <span data-testid="backup-last">{same ? `${last}${last.endsWith('.') ? ' ' : '. '}${t('backup.upToDate')}` : last}</span>
        </div>
      </div>
      <button class="primary bk-btn rise" style={{ '--i': 1 } as CSSProperties} data-testid="btn-export" onClick={() => void runBackup()}>{t('backup.export')}</button>
      <button class="bk-btn second rise" style={{ '--i': 2 } as CSSProperties} data-testid="btn-import" onClick={() => file.current?.click()}>{t('backup.import')}</button>
      <h2 class="section-head">{t('backup.recent')}</h2>
      <div class="group" data-testid="snap-exports">
        {exports.length ? exports.map((s, i) => row(s, 'export', i)) : <p class="group-row text muted" data-testid="snap-none">{t('backup.none')}</p>}
      </div>
      <p class="section-foot">{t('backup.recentNote')}</p>
      <h2 class="section-head">{t('backup.autoHead')}</h2>
      <div class="group" data-testid="snap-autos">
        {autos.length ? autos.map((s, i) => row(s, 'auto', i)) : <p class="group-row text muted">{t('backup.none')}</p>}
      </div>
      <p class="section-foot">{t('backup.autoNote')}</p>
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
      <Changelog />
    </>
  );
}
