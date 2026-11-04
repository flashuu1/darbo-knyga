import { useEffect, useRef } from 'preact/hooks';
import { inSideScroller } from './gestures';

const IGNORE = 'input, textarea, select, [data-no-side-swipe]'; // a field keeps its cursor drags
/**
 * A sideways swipe on an element: `onSwipe(1)` for one to the left (the next), `onSwipe(-1)` for one to the right (the previous).
 * A drag that starts in a field or on anything that scrolls sideways is not for it; a mostly vertical drag is a scroll; the tap
 * that would follow a swipe is eaten. The element needs `touch-action: pan-y` so that a sideways drag reaches it.
 */
export function useSideSwipe(ref: { current: HTMLElement | null }, onSwipe: (dir: -1 | 1) => void) {
  const cb = useRef(onSwipe);
  cb.current = onSwipe;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let g: { id: number; x0: number; y0: number; t0: number; yes: boolean } | null = null;
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      g = !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || t.closest(IGNORE) || inSideScroller(t, el) ? null : { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), yes: false };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.yes) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) g = null; // she is scrolling
      else if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.5) g.yes = true;
    };
    const up = (e: PointerEvent) => {
      const s = g;
      g = null;
      if (!s || !s.yes || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x0, fast = Math.abs(dx) / Math.max(1, performance.now() - s.t0) > 0.5;
      if (Math.abs(dx) < (fast ? 36 : 64)) return;
      const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      el.addEventListener('click', eat, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', eat, true), 120);
      cb.current(dx < 0 ? 1 : -1);
    };
    const cancel = () => { g = null; };
    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', cancel, { passive: true });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
  }, []);
}
