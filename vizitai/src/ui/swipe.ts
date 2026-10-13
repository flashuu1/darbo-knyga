import { useRef } from 'preact/hooks';
import { ui } from './store';

export function useSwipe(onSwipe?: (dir: -1 | 1) => void) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (ev: TouchEvent) => { const p = ev.touches[0]; if (p) touch.current = { x: p.clientX, y: p.clientY }; },
    onTouchMove: () => { if (ui.get().drag) touch.current = null; }, // a long-press drag is never a swipe
    onTouchEnd: (ev: TouchEvent) => {
      const s = touch.current; touch.current = null;
      if (!s || !onSwipe || !ev.changedTouches[0]) return;
      const dx = ev.changedTouches[0].clientX - s.x, dy = ev.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
