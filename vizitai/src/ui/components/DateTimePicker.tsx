import { useEffect, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { monthName, weekdayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, datePart, timePart, todayStr, weekStart } from '../../logic/time';
import { useLive } from '../hooks';
import { useSwipe } from '../swipe';
import { TimeWheel } from './TimeWheel';

const addMonths = (first: string, n: number) => {
  const d = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * In-app date and time selector: a month calendar above two time wheels (hours, minutes).
 * Value and result are local wall-clock `YYYY-MM-DDTHH:mm` strings; every minute can be chosen.
 */
export function DateTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const date = datePart(value);
  const time = timePart(value);
  const [month, setMonth] = useState(`${date.slice(0, 7)}-01`);
  const [dir, setDir] = useState<1 | -1>(1);
  const gridStart = weekStart(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const counts = useLive(() => repo.countsByDate(gridStart, addDays(gridStart, 42)), [gridStart], new Map<string, number>());
  const today = todayStr();
  const shift = (d: 1 | -1) => { setDir(d); setMonth((m) => addMonths(m, d)); };
  const swipe = useSwipe(shift);

  // keep the picked day's month in view when the value is changed from outside
  useEffect(() => { setMonth((m) => (m.slice(0, 7) === date.slice(0, 7) ? m : `${date.slice(0, 7)}-01`)); }, [date]);

  return (
    <div class="picker" data-testid="picker">
      <div class="picker-head">
        <button class="picker-nav" data-testid="pick-prev" aria-label={t('picker.prev')} onClick={() => shift(-1)}>‹</button>
        <b class="picker-title" data-testid="pick-month">{monthName(month)} {month.slice(0, 4)}</b>
        <button class="picker-nav" data-testid="pick-next" aria-label={t('picker.next')} onClick={() => shift(1)}>›</button>
      </div>
      <div class="picker-dows" aria-hidden="true">{days.slice(0, 7).map((d) => <span key={d}>{weekdayShort(d)}</span>)}</div>
      <div class="picker-months" {...swipe}>
        <div class={`picker-grid ${dir > 0 ? 'from-r' : 'from-l'}`} key={month}>
          {days.map((d) => {
            const sel = d === date, out = d.slice(0, 7) !== month.slice(0, 7);
            return (
              <button key={d} data-testid={`pick-day-${d}`}
                class={['pd', sel ? 'sel' : '', out ? 'out' : '', d === today ? 'today' : ''].filter(Boolean).join(' ')}
                onClick={() => onChange(`${d}T${time}`)}>
                <span>{+d.slice(8, 10)}</span>
                <i class={counts.get(d) ? 'dot on' : 'dot'} />
              </button>
            );
          })}
        </div>
      </div>
      <TimeWheel value={time} onChange={(hm) => onChange(`${date}T${hm}`)} />
    </div>
  );
}
