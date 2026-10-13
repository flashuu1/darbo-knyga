import { formatDayLong } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, todayStr } from '../../logic/time';
import { openNewToday } from '../actions';
import { PlusIcon } from '../icons';
import { ui, useStore } from '../store';
import { TimelineGrid } from '../components/TimelineGrid';
import { WeekStrip } from '../components/WeekStrip';

export function CalendarScreen() {
  const { view, date } = useStore(ui);
  const flip = (dir: -1 | 1) => ui.set({ date: addDays(ui.get().date, dir) });
  return (
    <section class="cal" data-testid="calendar">
      <header class="navbar">
        <button class="nav-btn" data-testid="btn-today" onClick={() => ui.set({ date: todayStr() })}>{t('nav.today')}</button>
        <button class="nav-btn plus" data-testid="btn-add" aria-label={t('sheet.new.title')} onClick={() => void openNewToday()}><PlusIcon /></button>
      </header>
      <h1 class="large-title" data-testid="title">{formatDayLong(date)}</h1>
      <WeekStrip />
      {view === 'day' && <TimelineGrid dates={[date]} compact={false} onSwipe={flip} />}
    </section>
  );
}
