import { repo } from '../../db/repo';
import { weekdayShort } from '../../i18n/format';
import { addDays, todayStr, weekStart } from '../../logic/time';
import { useLive } from '../hooks';
import { ui, useStore } from '../store';

export function MonthGrid() {
  const { date } = useStore(ui);
  const first = `${date.slice(0, 8)}01`;
  const gridStart = weekStart(first);
  const nextMonthFirst = addDays(`${date.slice(0, 8)}28`, 4).slice(0, 8) + '01';
  const weeks = Math.ceil((((Date.parse(nextMonthFirst) - Date.parse(gridStart)) / 86400000)) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const counts = useLive(() => repo.countsByDate(gridStart, addDays(gridStart, weeks * 7)), [gridStart, weeks], new Map<string, number>());
  const today = todayStr();
  return (
    <div class="month" data-testid="month">
      <div class="month-head">{days.slice(0, 7).map((d) => <span key={d}>{weekdayShort(d)}</span>)}</div>
      <div class="month-body">
        {days.map((d) => (
          <button key={d} data-testid={`month-cell-${d}`} class={['month-cell', d.slice(0, 7) !== date.slice(0, 7) ? 'out' : '', d === today ? 'today' : ''].join(' ')}
            onClick={() => ui.set({ view: 'day', date: d })}>
            <span class="num">{+d.slice(8, 10)}</span>
            {counts.get(d) ? <span class="count">{counts.get(d)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
