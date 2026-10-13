import { useEffect, useRef } from 'preact/hooks';
import { repo, type Entry } from '../../db/repo';
import { layoutColumns, visibleRange } from '../../logic/layout';
import { addDays, datePart, hhmm, minutesOfDay, nowLocal } from '../../logic/time';
import { t } from '../../i18n/lt';
import { openNew } from '../actions';
import { useLive, useSettings } from '../hooks';
import { EntryBlock } from './EntryBlock';

export function TimelineGrid({ dates, compact, onSwipe }: { dates: string[]; compact: boolean; onSwipe?: (dir: -1 | 1) => void }) {
  const settings = useSettings();
  const first = dates[0], last = dates[dates.length - 1];
  const rangeKey = first + '|' + last;
  const data = useLive(async () => ({ key: rangeKey, list: await repo.entriesBetween(first, addDays(last, 1)) }), [first, last], { key: '', list: [] as Entry[] });
  const loaded = data.key === rangeKey;
  const entries = loaded ? data.list : [];
  const { startMin, endMin } = visibleRange(settings, entries);
  const rows = (endMin - startMin) / 15;
  const scroller = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { // open near the first booking, else near now, else the top
    const el = scroller.current;
    if (!el || !loaded) return;
    const dayEntries = entries.filter((e) => e.appt.status !== 'cancelled');
    const target = dayEntries.length ? Math.min(...dayEntries.map((e) => minutesOfDay(e.appt.start))) : minutesOfDay(nowLocal());
    el.scrollTop = Math.max(0, ((target - startMin) / 15) * el.scrollHeight / rows - 88);
  }, [first, last, loaded]); // eslint-disable-line

  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);

  return (
    <div class="grid-scroll" ref={scroller} data-testid="timeline"
      onTouchStart={(ev) => { const p = ev.touches[0]; touch.current = { x: p.clientX, y: p.clientY }; }}
      onTouchEnd={(ev) => {
        const s = touch.current; touch.current = null;
        if (!s || !onSwipe || !ev.changedTouches[0]) return;
        const dx = ev.changedTouches[0].clientX - s.x, dy = ev.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
      }}>
      <div class="grid" style={{ height: `calc(var(--row) * ${rows})` }}>
        <div class="gutter">
          {hours.map((m) => (<div key={m} class="hour" style={{ height: 'calc(var(--row) * 4)' }}>{hhmm(m)}</div>))}
        </div>
        {dates.map((d) => {
          const dayEntries = entries.filter((e) => datePart(e.appt.start) === d);
          const live = dayEntries.filter((e) => e.appt.status !== 'cancelled');
          const lay = layoutColumns(live.map((e) => {
            const s = minutesOfDay(e.appt.start);
            return { id: e.appt.id, start: s, end: s + e.minutes };
          }));
          return (
            <div key={d} class="col" data-col-date={d} data-range-start={startMin} data-rows={rows} data-testid={`col-${d}`}>
              {Array.from({ length: rows }, (_, i) => {
                const slot = `${d}T${hhmm(startMin + i * 15)}`;
                return (<button key={slot} class={i % 4 === 0 ? 'slot hour-line' : 'slot'} data-testid={`slot-${slot}`} aria-label={slot.slice(11)} onClick={() => openNew(slot)} />);
              })}
              {dayEntries.map((e) => {
                const l = lay.get(e.appt.id) ?? { col: 0, cols: 1 };
                return <EntryBlock key={e.appt.id} e={e} startMin={startMin} col={l.col} cols={l.cols} compact={compact} />;
              })}
              {loaded && entries.length === 0 && dates.length === 1 && <p class="empty" data-testid="empty-day">{t('empty.day')}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
