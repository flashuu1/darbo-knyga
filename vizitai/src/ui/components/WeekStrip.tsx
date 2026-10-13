import { useEffect, useRef } from 'preact/hooks';
import { repo } from '../../db/repo';
import { weekdayShort } from '../../i18n/format';
import { addDays, datePart, weekStart } from '../../logic/time';
import { useNow } from '../clock';
import { useLive } from '../hooks';
import { ui, useStore } from '../store';

/** Remembers the previous value and returns the direction of the last change (-1, 0, 1). */
export function useDirection(v: string): number {
  const prev = useRef(v);
  const dir = useRef(0);
  if (v !== prev.current) { dir.current = v > prev.current ? 1 : -1; }
  useEffect(() => { prev.current = v; }, [v]);
  return dir.current;
}

export function WeekStrip() {
  const { date, drag } = useStore(ui);
  const today = datePart(useNow());
  const start = weekStart(date);
  const dir = useDirection(start);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const counts = useLive(() => repo.countsByDate(start, addDays(start, 7)), [start], new Map<string, number>());
  return (
    <div class="weekstrip">
      <div key={start} class={dir ? `weekstrip-row slide-in-${dir > 0 ? 'next' : 'prev'}` : 'weekstrip-row'}>
        {days.map((d) => (
          <button key={d} class={['chip-day', d === date ? 'sel' : '', d === today ? 'today' : '', drag?.over?.date === d ? 'drop' : ''].filter(Boolean).join(' ')} data-chip-date={d} data-testid={`chip-${d}`}
            aria-pressed={d === date} onClick={() => ui.set({ date: d })}>
            <span class="wd">{weekdayShort(d)}</span>
            <span class="num">{+d.slice(8, 10)}</span>
            <span class={counts.get(d) ? 'dot on' : 'dot'} />
          </button>
        ))}
      </div>
    </div>
  );
}
