import { useEffect } from 'preact/hooks';
import { inSideScroller } from './gestures';
import { goPage, pageIndex, statsUi } from './statsUi';

const NO_PAGE_SWIPE = '.lc, .ov, .swipe-row, .fc-plot, input, textarea, .glass, [data-no-page-swipe]'; // things that use a sideways drag themselves
/**
 * A sideways swipe on Išlaidos turns the page: the month, then the four pages of Analizė, and back. Charts, the period bar
 * and rows with their own drags keep them. A page turn eats the click that would follow.
 */
export function usePager(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let g: { id: number; x0: number; y0: number; t0: number; state: 'maybe' | 'yes' } | null = null;
    const down = (e: PointerEvent) => {
      g = null;
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || (e.target as HTMLElement).closest(NO_PAGE_SWIPE) || inSideScroller(e.target, el)) return;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), state: 'maybe' };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.state === 'yes') return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) g = null; // she is scrolling
      else if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.5) g.state = 'yes';
    };
    const up = (e: PointerEvent) => {
      const s = g;
      g = null;
      if (!s || e.pointerId !== s.id || s.state !== 'yes') return;
      const dx = e.clientX - s.x0, fast = Math.abs(dx) / Math.max(1, performance.now() - s.t0) > 0.5;
      if (Math.abs(dx) < (fast ? 36 : 64)) return;
      goPage(pageIndex(statsUi.get()) + (dx < 0 ? 1 : -1));
      const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      el.addEventListener('click', eat, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', eat, true), 120);
    };
    const cancel = () => { g = null; };
    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', cancel, { passive: true });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
  }, []);
}
