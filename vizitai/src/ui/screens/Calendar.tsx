import { formatDayLong, formatDayShort, monthName, weekdayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, datePart, todayStr, weekStart } from '../../logic/time';
import { openNewToday, runBackup } from '../actions';
import { useNow } from '../clock';
import { useNeedsBackup } from '../hooks';
import { BackIcon, BackupIcon, ChevronIcon, PlusIcon } from '../icons';
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
  const today = datePart(useNow());
  const step = (dir: -1 | 1) => {
    const d = ui.get().date;
    ui.set({ date: view === 'week' ? addDays(d, 7 * dir) : view === 'month' ? addDays(`${d.slice(0, 8)}15`, 30 * dir) : addDays(d, dir) });
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  const title = titleFor(view, date);
  return (
    <section class="cal" data-testid="calendar">
      <header class="chrome">
        <div class="navbar">
          <button class="nav-btn month-btn" data-testid="month-name" aria-expanded={view === 'month'} onClick={() => ui.set({ view: view === 'month' ? 'day' : 'month' })}>
            {view === 'month' ? <><span>{monthName(date)}</span><span class="chev-up"><ChevronIcon /></span></> : <><BackIcon /><span>{monthName(date)}</span></>}
          </button>
          <div class="segmented" role="group">
            {(['day', 'week'] as const).map((v) => (
              <button key={v} data-testid={`seg-${v}`} class={view === v ? 'seg on' : 'seg'} aria-pressed={view === v} onClick={() => ui.set({ view: v })}>{t(`view.${v}`)}</button>
            ))}
          </div>
          <div class="nav-right">
            <button class="nav-btn" data-testid="btn-today" onClick={() => ui.set({ date: todayStr() })}>{t('nav.today')}</button>
            <button class="nav-btn round accent" data-testid="btn-add" aria-label={t('sheet.new.title')} onClick={() => void openNewToday()}><PlusIcon /></button>
          </div>
        </div>
        <h1 key={title} class="large-title title-in" data-testid="title">{title}</h1>
        {view === 'day' && stale && (
          <button class="banner" data-testid="backup-banner" onClick={() => void runBackup()}>
            <BackupIcon /><span>{t('backup.banner')}</span>
          </button>
        )}
        {view === 'day' && <div key="strip" class="view-anim"><WeekStrip /></div>}
        {view === 'week' && (
          <div class="weekhead view-anim" key="weekhead">
            {days.map((d) => (
              <button key={d} data-testid={`weekhead-${d}`} class={d === today ? 'wh today' : 'wh'} onClick={() => ui.set({ view: 'day', date: d })}>
                <span>{weekdayShort(d)}</span><b>{+d.slice(8, 10)}</b>
              </button>
            ))}
          </div>
        )}
      </header>
      {view === 'day' && <TimelineGrid key="day" dates={[date]} compact={false} onSwipe={step} />}
      {view === 'week' && <TimelineGrid key="week" dates={days} compact onSwipe={step} />}
      {view === 'month' && <MonthGrid onSwipe={step} />}
    </section>
  );
}
