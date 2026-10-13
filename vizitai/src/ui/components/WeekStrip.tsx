import { repo } from '../../db/repo';
import { weekdayShort } from '../../i18n/format';
import { addDays, todayStr, weekStart } from '../../logic/time';
import { useLive } from '../hooks';
import { ui, useStore } from '../store';

export function WeekStrip() {
  const { date } = useStore(ui);
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const counts = useLive(() => repo.countsByDate(start, addDays(start, 7)), [start], new Map<string, number>());
  const today = todayStr();
  return (
    <div class="weekstrip">
      {days.map((d) => (
        <button key={d} class={['chip-day', d === date ? 'sel' : '', d === today ? 'today' : ''].join(' ')} data-chip-date={d} data-testid={`chip-${d}`}
          onClick={() => ui.set({ date: d })}>
          <span class="wd">{weekdayShort(d)}</span>
          <span class="num">{+d.slice(8, 10)}</span>
          <span class={counts.get(d) ? 'dot on' : 'dot'} />
        </button>
      ))}
    </div>
  );
}
