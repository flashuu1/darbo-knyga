import { formatDayLong, formatDayShort, monthName, weekdayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, todayStr, weekStart } from '../../logic/time';
import { openNewToday, runBackup } from '../actions';
import { useNeedsBackup } from '../hooks';
import { ChevronIcon, PlusIcon } from '../icons';
import { ui, useStore, type UiState } from '../store';
import { MonthGrid } from '../components/MonthGrid';
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
  const step = (dir: -1 | 1) => {
    const d = ui.get().date;
    ui.set({ date: view === 'week' ? addDays(d, 7 * dir) : view === 'month' ? addDays(`${d.slice(0, 8)}15`, 30 * dir) : addDays(d, dir) });
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  return (
    <section class="cal" data-testid="calendar">
      <header class="navbar">
        <button class="nav-btn" data-testid="btn-today" onClick={() => ui.set({ date: todayStr() })}>{t('nav.today')}</button>
        <div class="segmented" role="group">
          {(['day', 'week'] as const).map((v) => (
            <button key={v} data-testid={`seg-${v}`} class={view === v ? 'seg on' : 'seg'} onClick={() => ui.set({ view: v })}>{t(`view.${v}`)}</button>
          ))}
        </div>
        <button class="nav-btn plus" data-testid="btn-add" aria-label={t('sheet.new.title')} onClick={() => void openNewToday()}><PlusIcon /></button>
      </header>
      <div class="title-row">
        <h1 class="large-title" data-testid="title">{titleFor(view, date)}</h1>
        <button class="nav-btn" data-testid="month-name" onClick={() => ui.set({ view: view === 'month' ? 'day' : 'month' })}>
          {monthName(date)} <ChevronIcon />
        </button>
      </div>
      {view === 'day' && stale && <button class="banner" data-testid="backup-banner" onClick={() => void runBackup()}>{t('backup.banner')}</button>}
      {view === 'day' && <WeekStrip />}
      {view === 'week' && (
        <div class="weekhead">
          {days.map((d) => (
            <button key={d} data-testid={`weekhead-${d}`} class={d === todayStr() ? 'wh today' : 'wh'} onClick={() => ui.set({ view: 'day', date: d })}>
              <span>{weekdayShort(d)}</span><b>{+d.slice(8, 10)}</b>
            </button>
          ))}
        </div>
      )}
      {view === 'day' && <TimelineGrid dates={[date]} compact={false} onSwipe={step} />}
      {view === 'week' && <TimelineGrid dates={days} compact onSwipe={step} />}
      {view === 'month' && <MonthGrid onSwipe={step} />}
    </section>
  );
}
