import { useEffect } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatDayLong, formatDayShort, monthName, weekdayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, datePart, todayStr, weekStart } from '../../logic/time';
import { openNewToday, openSummary, runBackup } from '../actions';
import { useNow } from '../clock';
import { useFreeWeek } from '../free';
import { freeUi } from '../freeUi';
import { useLive, useNeedsBackup } from '../hooks';
import { BackupIcon, ChevronIcon, NextIcon, PlusIcon } from '../icons';
import { ui, useStore, type UiState } from '../store';
import { FreePill } from '../components/FreePill';
import { MonthGrid } from '../components/MonthGrid';
import { LiquidSeg } from '../components/Segmented';
import { TimelineGrid } from '../components/TimelineGrid';
import { WeekStrip } from '../components/WeekStrip';

function titleFor(view: UiState['view'], date: string) {
  if (view === 'day') return formatDayLong(date);
  if (view === 'week') { const s = weekStart(date); return `${formatDayShort(s)} – ${formatDayShort(addDays(s, 6))}`; }
  return `${monthName(date)} ${date.slice(0, 4)}`;
}

export function CalendarScreen() {
  const { view, date } = useStore(ui);
  const stale = useNeedsBackup();
  const waiting = useLive(() => repo.dueCount(), [], 0);
  const today = datePart(useNow());
  const step = (dir: -1 | 1) => {
    const d = ui.get().date;
    ui.set({ date: view === 'week' ? addDays(d, 7 * dir) : view === 'month' ? addDays(`${d.slice(0, 8)}15`, 30 * dir) : addDays(d, dir) });
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  const title = titleFor(view, date);
  const free = useFreeWeek(days, view === 'week');
  useEffect(() => { freeUi.set({ ri: 0 }); }, [days[0]]); // another week: its own best time first
  return (
    <section class="cal" data-testid="calendar">
      <header class="chrome">
        <div class="navbar cal-bar">
          <button class="lq lq-btn month-btn" data-testid="month-name" aria-expanded={view === 'month'} onClick={() => ui.set({ view: view === 'month' ? 'day' : 'month' })}>
            <span>{monthName(date)}</span>{view === 'month' && <span class="chev-up"><ChevronIcon /></span>}
          </button>
          <LiquidSeg items={[{ id: 'day', label: t('view.day') }, { id: 'week', label: t('view.week') }]} value={view === 'month' ? ('' as 'day') : view}
            onChange={(v) => ui.set({ view: v })} itemTestId={(id) => `seg-${id}`} />
          <button class="lq lq-btn lq-round" data-testid="btn-add" aria-label={t('sheet.new.title')} onClick={() => void openNewToday()}><PlusIcon /></button>
        </div>
        <h1 key={title} class="large-title title-in" data-testid="title">{title}</h1>
        <button class="summary-btn" data-testid="summary-btn" onClick={() => openSummary(view)}>
          <span class="sb-label" data-testid="summary-label">{t(`eod.title.${view}`)}</span>
          {waiting > 0 && <span class="due-badge" data-testid="due-badge" aria-hidden="true">{waiting}</span>}
          <span class="b-chev" aria-hidden="true"><NextIcon /></span>
        </button>
        {free && <FreePill free={free} onNextWeek={() => step(1)} />}
        {view === 'day' && stale && (
          <button class="banner" data-testid="backup-banner" onClick={() => void runBackup()}>
            <BackupIcon /><span>{t('backup.banner')}</span>
          </button>
        )}
        {view === 'day' && <div key="strip" class="view-anim"><WeekStrip /></div>}
        {view === 'week' && (
          <div class="weekhead view-anim" key={`weekhead${days[0]}`}>
            {days.map((d) => (
              <button key={d} data-testid={`weekhead-${d}`} class={d === today ? 'wh today' : 'wh'} onClick={() => ui.set({ view: 'day', date: d })}>
                <span>{weekdayShort(d)}</span><b>{+d.slice(8, 10)}</b>
              </button>
            ))}
          </div>
        )}
      </header>
      {view !== 'month' && <TimelineGrid dates={view === 'day' ? [date] : days} compact={view === 'week'} onSwipe={step} free={free} />}
      {view === 'month' && <MonthGrid onSwipe={step} />}
      <button class="lq lq-btn today-fab" data-testid="btn-today" onClick={() => ui.set({ date: todayStr() })}>{t('nav.today')}</button>
    </section>
  );
}
