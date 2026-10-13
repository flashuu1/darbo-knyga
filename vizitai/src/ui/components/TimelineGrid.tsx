import type { CSSProperties } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { repo, type Entry } from '../../db/repo';
import { layoutLanes, visibleRange } from '../../logic/layout';
import { addDays, datePart, hhmm, minutesOfDay } from '../../logic/time';
import { t } from '../../i18n/lt';
import { openNew, showOverflow } from '../actions';
import { useNow } from '../clock';
import { useLive, useSettings } from '../hooks';
import { CalendarIcon } from '../icons';
import { ui, useStore } from '../store';
import { useSwipe } from '../swipe';
import { EntryBlock } from './EntryBlock';

const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
/** Most lanes side by side before the rest collapse into a "+N" chip. */
const MAX_LANES = { day: 3, week: 2 };

export function TimelineGrid({ dates, compact, onSwipe }: { dates: string[]; compact: boolean; onSwipe?: (dir: -1 | 1) => void }) {
  const settings = useSettings();
  const now = useNow();
  const today = datePart(now);
  const first = dates[0], last = dates[dates.length - 1];
  const rangeKey = first + '|' + last;
  const data = useLive(async () => ({ key: rangeKey, list: await repo.entriesBetween(first, addDays(last, 1)) }), [first, last], { key: '', list: [] as Entry[] });
  const loaded = data.key === rangeKey;
  const entries = loaded ? data.list : [];
  const { startMin, endMin } = visibleRange(settings, entries);
  const rows = (endMin - startMin) / 15;
  const workFrom = toMin(settings.dayStart), workTo = toMin(settings.dayEnd);
  const scroller = useRef<HTMLDivElement>(null);
  const swipe = useSwipe(onSwipe);
  const { drag } = useStore(ui);
  const nowMin = minutesOfDay(now);
  const showNow = dates.includes(today) && nowMin >= startMin && nowMin < endMin;

  // Open on "now" for today, else near the first booking, else at the start of the working day.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !loaded || ui.get().drag) return; // never scroll under a finger that is dragging
    const live = entries.filter((e) => e.appt.status !== 'cancelled');
    const target = dates.includes(datePart(now)) ? minutesOfDay(now)
      : live.length ? Math.min(...live.map((e) => minutesOfDay(e.appt.start))) - 30
      : workFrom - 30;
    const col = el.querySelector<HTMLElement>('.col');
    if (!col) return;
    const rowPx = col.offsetHeight / rows;
    const colTop = col.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const lead = dates.includes(datePart(now)) ? el.clientHeight * 0.3 : 0; // "now" sits a third of the way down
    el.scrollTop = Math.max(0, colTop + ((Math.max(target, startMin) - startMin) / 15) * rowPx - lead);
  }, [first, last, loaded]);

  // A short fade of the entries when the day changes; the grid itself stays mounted (drag anchor).
  const prevFirst = useRef(first);
  useEffect(() => {
    const el = scroller.current;
    if (!el || prevFirst.current === first) return;
    const dir = first > prevFirst.current ? 1 : -1;
    prevFirst.current = first;
    if (ui.get().drag || !el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.querySelector('.grid')?.animate(
      [{ opacity: 0.35, transform: `translateX(${dir * 14}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }, [first]);

  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const rowStyle = (m: number) => ({ '--at': (m - startMin) / 15 }) as CSSProperties;

  return (
    <div class="timeline">
      <div class="grid-scroll" ref={scroller} data-testid="timeline" {...swipe}>
        <div class="grid-pad">
          <div class={compact ? 'grid week' : 'grid'} style={{ '--rows': rows } as CSSProperties}>
            <div class="gutter" aria-hidden="true">
              {hours.map((m) => (
                <span key={m} class={showNow && Math.abs(nowMin - m) < 10 ? 'hour-label covered' : 'hour-label'} style={rowStyle(m)}>{hhmm(m % 1440)}</span>
              ))}
              {showNow && <span class="now-label" data-testid="now-label" style={rowStyle(nowMin)}>{hhmm(nowMin)}</span>}
            </div>
            {dates.map((d) => {
              const dayEntries = entries.filter((e) => datePart(e.appt.start) === d);
              const live = dayEntries.filter((e) => e.appt.status !== 'cancelled');
              const lay = layoutLanes(live.map((e) => {
                const s = minutesOfDay(e.appt.start);
                return { id: e.appt.id, start: s, end: s + e.minutes };
              }), compact ? MAX_LANES.week : MAX_LANES.day);
              const byId = new Map(live.map((e) => [e.appt.id, e]));
              return (
                // Day view keeps one column across day flips so a dragged entry (and its gesture) stays mounted.
                <div key={dates.length === 1 ? 'day' : d} class={d === today ? 'col today' : 'col'} data-col-date={d} data-range-start={startMin} data-rows={rows} data-testid={`col-${d}`}>
                  {Array.from({ length: rows }, (_, i) => {
                    const m = startMin + i * 15;
                    const slot = `${d}T${hhmm(m)}`;
                    const cls = ['slot', i % 4 === 0 ? 'h' : i % 2 === 0 ? 'hh' : 'q', m < workFrom || m >= workTo ? 'off' : ''].join(' ');
                    return (<button key={slot} class={cls} data-testid={`slot-${slot}`} aria-label={slot.slice(11)} onClick={() => openNew(slot)} />);
                  })}
                  {[
                    ...dayEntries.map((e) => {
                      const l = lay.placed.get(e.appt.id) ?? { col: 0, cols: 1 };
                      if (e.appt.status !== 'cancelled' && !lay.placed.has(e.appt.id)) return null; // shown inside a "+N" chip
                      return <EntryBlock key={e.appt.id} e={e} startMin={startMin} col={l.col} cols={l.cols} compact={compact} />;
                    }),
                    // Anchor: same keyed list as the entries, so the dragged element is reused (not remounted) when the day flips.
                    ...(dates.length === 1 && drag && !dayEntries.some((e) => e.appt.id === drag.entry.appt.id)
                      ? [<EntryBlock key={drag.entry.appt.id} e={drag.entry} startMin={startMin} col={0} cols={1} compact={false} anchor />]
                      : []),
                  ]}
                  {lay.overflow.map((g) => (
                    <button key={`more-${g.start}`} class="entry-more" data-testid={`more-${d}T${hhmm(g.start)}`} data-entry-box=""
                      aria-label={t('overflow.aria', { n: g.ids.length })}
                      style={{ '--top': (g.start - startMin) / 15, '--len': 1, '--c': g.col, '--n': g.cols } as CSSProperties}
                      onClick={() => showOverflow(g.ids.map((id) => byId.get(id)!).filter(Boolean))}>
                      {t('overflow.more', { n: g.ids.length })}
                    </button>
                  ))}
                  {d === today && showNow && <div class="now-line" data-testid="now-line" style={rowStyle(nowMin)} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {loaded && entries.length === 0 && dates.length === 1 && (
        <div class="empty-overlay" data-testid="empty-day-wrap" aria-live="polite">
          <div class="empty-card">
            <span class="empty-icon"><CalendarIcon /></span>
            <p data-testid="empty-day">{t('empty.day')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
