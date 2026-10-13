import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { monthName, weekdayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, datePart, hhmm, timePart, todayStr, weekStart } from '../../logic/time';
import { useLive, useSettings } from '../hooks';
import { useSwipe } from '../swipe';

const addMonths = (first: string, n: number) => {
  const d = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
const TIMES = Array.from({ length: 96 }, (_, i) => hhmm(i * 15));
const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);

/**
 * In-app date and time selector: a month calendar above a scrollable grid of 15-minute slots.
 * Value and result are local wall-clock `YYYY-MM-DDTHH:mm` strings on the 15-minute grid.
 */
export function DateTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const date = datePart(value);
  const time = timePart(value);
  const settings = useSettings();
  const [month, setMonth] = useState(`${date.slice(0, 7)}-01`);
  const [dir, setDir] = useState<1 | -1>(1);
  const gridStart = weekStart(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const counts = useLive(() => repo.countsByDate(gridStart, addDays(gridStart, 42)), [gridStart], new Map<string, number>());
  const taken = useLive(
    async () => new Set((await repo.entriesBetween(date, addDays(date, 1))).filter((e) => e.appt.status === 'booked').map((e) => timePart(e.appt.start))),
    [date], new Set<string>());
  const today = todayStr();
  const shift = (d: 1 | -1) => { setDir(d); setMonth((m) => addMonths(m, d)); };
  const swipe = useSwipe(shift);

  // keep the picked day's month in view when the value is changed from outside
  useEffect(() => { setMonth((m) => (m.slice(0, 7) === date.slice(0, 7) ? m : `${date.slice(0, 7)}-01`)); }, [date]);

  const slots = useRef<HTMLDivElement>(null);
  useEffect(() => { // bring the picked time to the middle of the slot grid
    const box = slots.current;
    const el = box?.querySelector<HTMLElement>('[data-on]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2);
  }, [date]);

  const dayStart = toMin(settings.dayStart), dayEnd = toMin(settings.dayEnd);
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
              <button key={d} data-testid={`pick-day-${d}`} data-on={sel ? '' : undefined}
                class={['pd', sel ? 'sel' : '', out ? 'out' : '', d === today ? 'today' : ''].filter(Boolean).join(' ')}
                onClick={() => onChange(`${d}T${time}`)}>
                <span>{+d.slice(8, 10)}</span>
                <i class={counts.get(d) ? 'dot on' : 'dot'} />
              </button>
            );
          })}
        </div>
      </div>
      <div class="picker-slots" ref={slots} data-testid="pick-slots">
        {TIMES.map((hm) => {
          const m = toMin(hm);
          return (
            <button key={hm} data-testid={`pick-time-${hm}`} data-on={hm === time ? '' : undefined}
              class={['ps', hm === time ? 'sel' : '', m >= dayStart && m < dayEnd ? 'work' : '', taken.has(hm) ? 'taken' : ''].filter(Boolean).join(' ')}
              onClick={() => onChange(`${date}T${hm}`)}>
              {hm}{taken.has(hm) && <i class="dot on" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
