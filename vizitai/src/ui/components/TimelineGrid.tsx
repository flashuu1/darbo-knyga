import { Component, type CSSProperties } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { repo, type Entry } from '../../db/repo';
import { layoutLanes, visibleRange } from '../../logic/layout';
import { addDays, datePart, hhmm, minutesOfDay } from '../../logic/time';
import { t } from '../../i18n/lt';
import { openNew, showOverflow } from '../actions';
import { useNow } from '../clock';
import { useLive, useSettings } from '../hooks';
import { CalendarIcon } from '../icons';
import { ui, useStore } from '../store';
import { clampZoom, densityFor, labelStep, pinchZoom, saveZoom, snapZoom } from '../../logic/zoom';
import { EntryBlock } from './EntryBlock';

const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
/** Most lanes side by side before the rest collapse into a "+N" chip. */
const MAX_LANES = { day: 3, week: 2 };

// A finger is bigger than a thin entry. A tap that lands within this distance of an entry opens that entry instead of
// booking a new one beside it (a tap on the entry itself never gets here: the entry catches it).
const NEAR_X = 14, NEAR_Y = 9;
function slotTap(e: MouseEvent, slot: string) {
  const x = e.clientX, y = e.clientY;
  if (x || y) { // a keyboard activation has no position
    let best: HTMLElement | null = null, bestD = Infinity;
    const grid = (e.currentTarget as HTMLElement).closest('.grid');
    grid?.querySelectorAll<HTMLElement>('[data-entry-box]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      if (dx > NEAR_X || dy > NEAR_Y) return;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = el; }
    });
    if (best) { (best as HTMLElement).click(); return; } // still inside the tap, so a due visit can raise the number pad
  }
  openNew(slot);
}

/**
 * The tappable 15-minute rows of one column. They only change when the day, the visible range or the working hours do,
 * so a re-render of the calendar (a new minute, new data) skips all of these buttons.
 */
type SlotsProps = { d: string; startMin: number; rows: number; workFrom: number; workTo: number };
class Slots extends Component<SlotsProps> {
  shouldComponentUpdate(n: SlotsProps) {
    const p = this.props;
    return n.d !== p.d || n.startMin !== p.startMin || n.rows !== p.rows || n.workFrom !== p.workFrom || n.workTo !== p.workTo;
  }
  render({ d, startMin, rows, workFrom, workTo }: SlotsProps) {
    return (
      <>
        {Array.from({ length: rows }, (_, i) => {
          const m = startMin + i * 15;
          const slot = `${d}T${hhmm(m)}`;
          const cls = ['slot', i % 4 === 0 ? 'h' : i % 2 === 0 ? 'hh' : 'q', m < workFrom || m >= workTo ? 'off' : ''].join(' ');
          return (<button key={slot} class={cls} data-testid={`slot-${slot}`} aria-label={slot.slice(11)} onClick={(e) => slotTap(e, slot)} />);
        })}
      </>
    );
  }
}

/** Zoom level: how much detail the entries show, and which hours get a label and a line (all set directly, so a pinch never re-renders). */
function applyLevel(root: HTMLElement, z: number, startMin: number) {
  root.dataset.density = densityFor(z);
  const step = labelStep(z);
  const firstLine = Math.ceil(startMin / (60 * step)) * 60 * step;
  root.style.setProperty('--hstep', String(4 * step));
  root.style.setProperty('--hoff', String((firstLine - startMin) / 15));
  root.querySelectorAll<HTMLElement>('.hour-label').forEach((l) => {
    if ((+(l.dataset.min ?? 0) / 60) % step !== 0) l.setAttribute('data-skip', ''); else l.removeAttribute('data-skip');
  });
}

export function TimelineGrid({ dates, compact, onSwipe }: { dates: string[]; compact: boolean; onSwipe?: (dir: -1 | 1) => void }) {
  const settings = useSettings();
  const now = useNow();
  const today = datePart(now);
  const first = dates[0], last = dates[dates.length - 1];
  const rangeKey = first + '|' + last;
  const data = useLive(async () => ({ key: rangeKey, list: await repo.entriesBetween(first, addDays(last, 1)) }), [first, last], { key: '', list: [] as Entry[] });
  const loaded = data.key === rangeKey;
  const entries = data.list.filter((e) => { const d = datePart(e.appt.start); return d >= first && d <= last; }); // the previous range stays on screen until the new one arrives
  const { startMin, endMin } = visibleRange(settings, entries);
  const rows = (endMin - startMin) / 15;
  const workFrom = toMin(settings.dayStart), workTo = toMin(settings.dayEnd);
  const scroller = useRef<HTMLDivElement>(null);
  const rootEl = useRef<HTMLDivElement>(null);
  const { drag, zoom } = useStore(ui);
  const live = useRef({ startMin: 0, rows: 1, onSwipe });
  const skipAnim = useRef(false);
  const ownScroll = useRef(0); // until when scroll events come from the app itself, not from her finger
  live.current = { startMin, rows, onSwipe };
  const nowMin = minutesOfDay(now);
  const showNow = dates.includes(today) && nowMin >= startMin && nowMin < endMin;

  useLayoutEffect(() => { if (rootEl.current) applyLevel(rootEl.current, zoom, startMin); }, [zoom, startMin, rows]);

  // Open on "now" for today, else near the first booking, else at the start of the working day.
  // Switching Diena <-> Savaitė keeps the scroll position, so the same hours stay in view.
  const lastCount = useRef(dates.length);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !loaded || ui.get().drag) return; // never scroll under a finger that is dragging
    const switched = lastCount.current !== dates.length;
    lastCount.current = dates.length;
    if (switched) return;
    const live = entries.filter((e) => e.appt.status !== 'cancelled');
    const target = dates.includes(datePart(now)) ? minutesOfDay(now)
      : live.length ? Math.min(...live.map((e) => minutesOfDay(e.appt.start))) - 30
      : workFrom - 30;
    const col = el.querySelector<HTMLElement>('.col');
    if (!col) return;
    const rowPx = col.offsetHeight / rows;
    const colTop = col.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const lead = dates.includes(datePart(now)) ? el.clientHeight * 0.3 : 0; // "now" sits a third of the way down
    ownScroll.current = performance.now() + 300;
    el.scrollTop = Math.max(0, colTop + ((Math.max(target, startMin) - startMin) / 15) * rowPx - lead);
  }, [first, last, loaded]);

  // A short fade of the entries when the day changes, a slide when Diena <-> Savaitė switch; the grid itself stays mounted (drag anchor).
  const prevFirst = useRef(first), prevLen = useRef(dates.length);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const switched = prevLen.current !== dates.length, moved = prevFirst.current !== first;
    const dir = first > prevFirst.current ? 1 : -1;
    prevFirst.current = first; prevLen.current = dates.length;
    if (!switched && !moved) return;
    if (!switched && skipAnim.current) { skipAnim.current = false; return; }
    skipAnim.current = false;
    if (ui.get().drag || !el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.querySelector('.grid')?.animate(
      switched
        ? [{ opacity: 0.2, transform: `translateX(${dates.length > 1 ? 28 : -28}px)` }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0.35, transform: `translateX(${dir * 14}px)` }, { opacity: 1, transform: 'none' }],
      switched ? { duration: 320, easing: 'cubic-bezier(.32,.72,0,1)' } : { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }, [first, dates.length]);

  // The empty-day message shows for a moment when an empty day opens, and fades out by itself or as soon as she scrolls.
  const emptyDay = loaded && entries.length === 0 && dates.length === 1;
  const [emptyShown, setEmptyShown] = useState(false);
  useEffect(() => {
    if (!emptyDay) { setEmptyShown(false); return; }
    setEmptyShown(true);
    const id = window.setTimeout(() => setEmptyShown(false), 2600);
    return () => clearTimeout(id);
  }, [emptyDay, first]);

  // Gestures on the timeline: two fingers zoom the hours (apart = more hours in view), one finger sideways
  // slides to the next/previous day or week, following the finger.
  useEffect(() => {
    const el = scroller.current;
    const root = el?.parentElement;
    const pad = el?.querySelector<HTMLElement>('.grid-pad');
    if (!el || !root || !pad) return;
    type Pinch = { d0: number; z0: number; z: number; anchorMin: number; midY: number };
    let pinch: Pinch | null = null;
    let slide: { x0: number; y0: number; t0: number; dx: number; lock: 'h' | 'v' | null } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const col = () => el.querySelector<HTMLElement>('.col');
    const rowPx = () => (col()?.getBoundingClientRect().height ?? 44 * live.current.rows) / live.current.rows;
    /** Sets the zoom and keeps the time that is between her fingers where it was. */
    const applyZoom = (z: number, midY: number, anchorMin: number) => {
      root.style.setProperty('--zoom', String(z));
      applyLevel(root, z, live.current.startMin);
      const c = col();
      if (!c) return;
      const top = c.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      ownScroll.current = performance.now() + 300;
      el.scrollTop = top + ((anchorMin - live.current.startMin) / 15) * rowPx() - (midY - el.getBoundingClientRect().top);
    };
    const minuteAt = (y: number) => live.current.startMin + ((y - (col()?.getBoundingClientRect().top ?? 0)) / rowPx()) * 15;

    // Two fingers need preventDefault (no native scroll while zooming), and a non-passive touchmove listener makes
    // iOS wait for JavaScript before every scroll frame. So it is only attached while two fingers are down;
    // one-finger scrolling and sideways swipes run on passive listeners (the browser scrolls on its own).
    const pinchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      pinch.z = pinchZoom(pinch.z0, pinch.d0, dist(e.touches));
      pinch.midY = (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2;
      applyZoom(pinch.z, pinch.midY, pinch.anchorMin);
    };
    const endPinchListener = () => el.removeEventListener('touchmove', pinchMove);

    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        el.addEventListener('touchmove', pinchMove, { passive: false });
        slide = null; pad.style.transition = 'none'; pad.style.transform = '';
        const midY = (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2;
        pinch = { d0: dist(e.touches), z0: ui.get().zoom, z: ui.get().zoom, anchorMin: minuteAt(midY), midY };
        root.classList.add('pinching'); // exact (unrounded) row heights while the fingers move
      } else if (e.touches.length === 1 && !pinch && !ui.get().drag) {
        const p = e.touches[0]!;
        slide = { x0: p.clientX, y0: p.clientY, t0: performance.now(), dx: 0, lock: null };
      }
    };
    const move = (e: TouchEvent) => {
      if (pinch) return; // handled by pinchMove
      if (!slide || e.touches.length !== 1) return;
      if (ui.get().drag) { slide = null; return; } // a long-press drag is never a swipe
      const p = e.touches[0]!;
      const dx = p.clientX - slide.x0, dy = p.clientY - slide.y0;
      if (!slide.lock) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > 1.5 * Math.abs(dy)) slide.lock = 'h';
        else if (Math.abs(dy) > 10) slide.lock = 'v';
      }
      if (slide.lock === 'h' && live.current.onSwipe) {
        slide.dx = dx;
        pad.style.transition = 'none';
        pad.style.transform = `translateX(${dx * 0.9}px)`;
      }
    };
    const finish = (e: TouchEvent) => {
      if (pinch) {
        if (e.touches.length < 2) {
          const z = snapZoom(clampZoom(pinch.z));
          applyZoom(z, pinch.midY, pinch.anchorMin); // whole pixels per row once the fingers are up
          root.classList.remove('pinching');
          endPinchListener();
          pinch = null;
          saveZoom(z);
          ui.set({ zoom: z });
        }
        return;
      }
      const s = slide;
      slide = null;
      if (!s) return;
      const p = e.changedTouches[0];
      const dx = s.lock === 'h' ? s.dx : p ? p.clientX - s.x0 : 0;
      const dy = p ? p.clientY - s.y0 : 0;
      const velocity = Math.abs(dx) / Math.max(1, performance.now() - s.t0);
      const go = !!live.current.onSwipe && ((Math.abs(dx) > 70 && Math.abs(dx) > 1.6 * Math.abs(dy)) || (s.lock === 'h' && velocity > 0.6 && Math.abs(dx) > 30));
      if (!go) {
        if (s.lock === 'h') { pad.style.transition = 'transform var(--t-med) var(--ease-spring)'; pad.style.transform = ''; }
        return;
      }
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      const w = el.clientWidth;
      skipAnim.current = true;
      pad.style.transition = 'transform 110ms cubic-bezier(.4,0,1,1), opacity 110ms';
      pad.style.transform = `translateX(${-dir * w * 0.55}px)`;
      pad.style.opacity = '.15';
      window.setTimeout(() => {
        live.current.onSwipe?.(dir);
        pad.style.transition = 'none';
        pad.style.transform = `translateX(${dir * w * 0.45}px)`;
        void pad.offsetWidth; // apply that start position, then glide in
        pad.style.transition = 'transform 300ms cubic-bezier(.32,.72,0,1), opacity 220ms ease-out';
        pad.style.transform = '';
        pad.style.opacity = '';
        window.setTimeout(() => { pad.style.transition = ''; }, 320);
      }, 110);
    };
    const cancel = () => { if (pinch) { const z = snapZoom(clampZoom(pinch.z)); applyZoom(z, pinch.midY, pinch.anchorMin); saveZoom(z); ui.set({ zoom: z }); } root.classList.remove('pinching'); endPinchListener(); pinch = null; slide = null; };
    const onScroll = () => { if (performance.now() > ownScroll.current) setEmptyShown(false); };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', finish);
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      endPinchListener();
      el.removeEventListener('touchend', finish);
      el.removeEventListener('touchcancel', cancel);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const rowStyle = (m: number) => ({ '--at': (m - startMin) / 15 }) as CSSProperties;

  return (
    <div class="timeline" ref={rootEl} style={{ '--zoom': zoom } as CSSProperties}>
      <div class="grid-scroll" ref={scroller} data-testid="timeline">
        <div class="grid-pad">
          <div class={compact ? 'grid week' : 'grid'} style={{ '--rows': rows } as CSSProperties}>
            <div class="gutter" aria-hidden="true">
              {hours.map((m) => (
                <span key={m} class={showNow && Math.abs(nowMin - m) < 10 ? 'hour-label covered' : 'hour-label'} data-min={m} style={rowStyle(m)}>{hhmm(m % 1440)}</span>
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
                <div key={dates.length === 1 ? 'day' : d} class={['col', d === today ? 'today' : '', drag?.over?.date === d ? 'drop' : ''].filter(Boolean).join(' ')} data-col-date={d} data-range-start={startMin} data-rows={rows} data-testid={`col-${d}`}>
                  <Slots d={d} startMin={startMin} rows={rows} workFrom={workFrom} workTo={workTo} />
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
      {emptyDay && (
        <div class={emptyShown ? 'empty-overlay' : 'empty-overlay gone'} data-testid="empty-day-wrap" aria-live="polite">
          <div class="empty-card">
            <span class="empty-icon"><CalendarIcon /></span>
            <p data-testid="empty-day">{t('empty.day')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
