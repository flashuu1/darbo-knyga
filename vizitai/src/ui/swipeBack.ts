import { useEffect, useRef } from 'preact/hooks';
import { edgeZone, inSideScroller } from './gestures';

/** Set while something on the page is being dragged (a row being sorted): a sideways wobble must not take the page away. */
export const swipeGuard = { locked: false };
const IGNORE = 'input, textarea, select, .swipe-row, .wheel, [data-no-swipe-back]'; // things that use a sideways drag or a cursor themselves
/**
 * A page that goes back when it is swiped to the right, starting in the LEFT PART of it (`edgeZone`): the rest of the page, and
 * anything that scrolls sideways, keeps its own sideways drags. The page FOLLOWS the finger (what is behind it shows as it
 * slides away), and on release it either carries on out of the screen (far enough, or a quick flick) and `onDone` is called,
 * or springs back. A short or mostly vertical drag does nothing; the tap that would follow a drag is eaten.
 * The element needs `touch-action: pan-y` on its scrollers so a sideways drag reaches here (see layers.css).
 */
export function useSwipeBack(ref: { current: HTMLElement | null }, onDone: () => void, ready = true) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let g: { id: number; x0: number; y0: number; t0: number; on: boolean } | null = null;
    const down = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const wanted = e.isPrimary && e.clientX - r.left <= edgeZone(r.width) && !(e.target as HTMLElement).closest(IGNORE) && !inSideScroller(e.target, el);
      g = wanted ? { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), on: false } : null;
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      if (swipeGuard.locked) { g = null; return; }
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.on) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // she is scrolling
        if (dx < 14 || dx < Math.abs(dy) * 1.5) return;
        g.on = true;
        el.style.transition = 'none';
        el.style.animation = 'none'; // the page's own entrance must not fight the finger
      }
      el.style.transform = `translateX(${Math.max(0, dx)}px)`;
    };
    const up = (e: PointerEvent) => {
      const s = g;
      g = null;
      if (!s || !s.on || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x0, fast = dx / Math.max(1, performance.now() - s.t0) > 0.5;
      const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      el.addEventListener('click', eat, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', eat, true), 120);
      if (dx > 110 || (fast && dx > 50)) {
        el.style.transition = 'transform .28s var(--ease-spring)';
        el.style.transform = 'translateX(100%)';
        window.setTimeout(() => done.current(), 240);
      } else {
        el.style.transition = 'transform .38s var(--ease-spring)';
        el.style.transform = '';
      }
    };
    const cancel = () => { if (g?.on) { el.style.transition = 'transform .3s var(--ease-spring)'; el.style.transform = ''; } g = null; };
    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', cancel, { passive: true });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
  }, [ready]);
}
