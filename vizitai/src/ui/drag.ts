import type { Entry } from '../db/repo';
import { AUTOSCROLL_ZONE_PX, EDGE_HOLD_MS, edgeSide, exceedsThreshold, HOLD_MS, startFromY } from '../logic/drag';
import { addDays, timePart } from '../logic/time';
import { moveWithToast } from './actions';
import { ui } from './store';

/** Long-press (400 ms) then drag. Listeners live on the entry element so the gesture survives day flips
 *  (TimelineGrid keeps this element mounted while a drag is active). */
export function bindEntryDrag(el: HTMLElement, getEntry: () => Entry): () => void {
  let timer = 0, edgeTimer = 0, raf = 0;
  let pid = -1, sx = 0, sy = 0, lx = 0, ly = 0, grabDY = 0, side = 0;
  let lifted = false, justDragged = false, dirty = false, idle = 0;

  const clearTimers = () => { clearTimeout(timer); clearTimeout(edgeTimer); cancelAnimationFrame(raf); side = 0; };
  const reset = () => { clearTimers(); pid = -1; lifted = false; ui.set({ drag: null }); };

  function target(): { date: string; start: string } | null {
    const hit = document.elementFromPoint(lx, ly) as HTMLElement | null;
    if (!hit) return null;
    const entry = getEntry();
    const chip = hit.closest<HTMLElement>('[data-chip-date]');
    if (chip) return { date: chip.dataset.chipDate!, start: `${chip.dataset.chipDate}T${timePart(entry.appt.start)}` };
    const col = hit.closest<HTMLElement>('[data-col-date]');
    if (!col) return null;
    const r = col.getBoundingClientRect();
    const date = col.dataset.colDate!;
    const start = startFromY({ date, rangeStartMin: +col.dataset.rangeStart!, rows: +col.dataset.rows!, colTop: r.top, colHeight: r.height, y: ly, grabDY });
    return { date, start };
  }
  function update() {
    dirty = false; idle = 0;
    const d = ui.get().drag;
    if (!d) return;
    const over = target();
    if (d.x === lx && d.y === ly && d.over?.start === over?.start) return; // nothing changed: no re-render
    ui.set({ drag: { ...d, x: lx, y: ly, over, label: over ? over.start : d.entry.appt.start } });
  }
  function armEdge() {
    const s = ui.get().view === 'day' ? edgeSide(lx, window.innerWidth) : 0;
    if (s === side) return;
    clearTimeout(edgeTimer);
    side = s;
    if (!s) return;
    const flip = () => {
      ui.set({ date: addDays(ui.get().date, s) });
      dirty = true;
      edgeTimer = window.setTimeout(flip, EDGE_HOLD_MS);
    };
    edgeTimer = window.setTimeout(flip, EDGE_HOLD_MS);
  }
  function loop() {
    const sc = el.closest<HTMLElement>('.grid-scroll');
    if (sc) {
      const r = sc.getBoundingClientRect();
      const before = sc.scrollTop;
      if (ly < r.top + AUTOSCROLL_ZONE_PX) sc.scrollTop -= 8;
      else if (ly > r.bottom - AUTOSCROLL_ZONE_PX) sc.scrollTop += 8;
      if (sc.scrollTop !== before) dirty = true;
    }
    // Finger still: only re-hit-test every ~10 frames (catches the grid re-laying out after a day flip loads).
    if (dirty || ++idle >= 10) update();
    raf = requestAnimationFrame(loop);
  }
  function lift() {
    if (ui.get().drag) { pid = -1; return; } // another entry lifted while this hold was running
    const entry = getEntry();
    const r = el.getBoundingClientRect();
    lifted = true;
    grabDY = sy - r.top;
    try { el.setPointerCapture(pid); } catch { /* pointer already gone */ }
    ui.set({ drag: { entry, label: entry.appt.start, x: lx, y: ly, grabDY, left: r.left, width: r.width, over: null } });
    update();
    loop();
  }

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (lifted || ui.get().drag || getEntry().appt.status === 'cancelled') return; // a second finger never hijacks a drag (on any entry)
    clearTimeout(timer);
    pid = e.pointerId; sx = lx = e.clientX; sy = ly = e.clientY; lifted = false; justDragged = false;
    timer = window.setTimeout(lift, HOLD_MS);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    lx = e.clientX; ly = e.clientY; dirty = true;
    if (!lifted) {
      if (exceedsThreshold(lx - sx, ly - sy)) { clearTimeout(timer); pid = -1; } // a scroll, not a drag
      return;
    }
    armEdge();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    if (!lifted) { clearTimers(); pid = -1; return; }
    lx = e.clientX; ly = e.clientY;
    update(); // drop where the finger is now, not where the last animation frame saw it
    const d = ui.get().drag;
    const entry = getEntry();
    reset();
    justDragged = true;
    if (d?.over && d.over.start !== entry.appt.start) void moveWithToast(entry.appt.id, d.over.start);
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    if (lifted) reset();
    else { clearTimers(); pid = -1; }
  };
  const touchMove = (e: TouchEvent) => { if (lifted) e.preventDefault(); };
  const click = (e: MouseEvent) => { if (justDragged) { e.stopImmediatePropagation(); e.preventDefault(); justDragged = false; } };
  const noMenu = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', cancel);
  el.addEventListener('touchmove', touchMove, { passive: false });
  el.addEventListener('click', click, true);
  el.addEventListener('contextmenu', noMenu);
  return () => {
    if (lifted) reset(); // unmounted mid-drag: never leave a stuck ghost or a busy store
    else clearTimers();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('lostpointercapture', cancel);
    el.removeEventListener('touchmove', touchMove);
    el.removeEventListener('click', click, true);
    el.removeEventListener('contextmenu', noMenu);
  };
}
