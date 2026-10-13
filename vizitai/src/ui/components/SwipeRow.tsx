import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { t } from '../../i18n/lt';
import { TrashIcon } from '../icons';

const REVEAL = 88; // px the row slides to show the trash button
let openRow: (() => void) | null = null; // only one row is open at a time

/**
 * A list row that slides to the left to reveal a red trash button (like iOS lists).
 * Vertical drags still scroll the list; a tap on an open row only closes it.
 */
export function SwipeRow({ children, onDelete, testId }: { children: ComponentChildren; onDelete: () => void; testId: string }) {
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; base: number; x: number; lock: 'h' | 'v' | null; t0: number } | null>(null);
  const [open, setOpen] = useState(false);
  const x = useRef(0);

  const slide = (to: number, animate: boolean) => {
    x.current = to;
    const el = content.current;
    if (!el) return;
    el.style.transition = animate ? 'transform var(--t-med) var(--ease-spring)' : 'none';
    el.style.transform = to ? `translateX(${to}px)` : '';
  };
  const close = () => { slide(0, true); setOpen(false); if (openRow === close) openRow = null; };
  const reveal = () => {
    if (openRow && openRow !== close) openRow();
    openRow = close;
    slide(-REVEAL, true); setOpen(true);
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (openRow && openRow !== close) openRow(); // touching another row closes the open one
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: x.current, x: x.current, lock: null, t0: performance.now() };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.lock) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { d.lock = 'h'; try { content.current?.setPointerCapture(e.pointerId); } catch { /* gone */ } }
      else if (Math.abs(dy) > 8) d.lock = 'v';
    }
    if (d.lock === 'h') {
      d.x = Math.max(-REVEAL * 1.35, Math.min(0, d.base + dx));
      slide(d.x, false);
    }
  };
  const end = (e: PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.lock !== 'h') return;
    suppress.current = true;
    window.setTimeout(() => { suppress.current = false; }, 0);
    const flick = (d.x - d.base) / Math.max(1, performance.now() - d.t0) < -0.5; // fast leftward flick
    if (!cancelled && (d.x < -REVEAL / 2 || flick)) reveal(); else close();
  };
  const suppress = useRef(false);
  const click = (e: MouseEvent) => {
    if (suppress.current) { e.stopPropagation(); e.preventDefault(); return; } // the end of a swipe is not a tap
    if (open) { e.stopPropagation(); e.preventDefault(); close(); }
  };

  return (
    <div class="swipe-row" data-testid={testId}>
      <button class="swipe-trash" data-testid={`${testId}-trash`} aria-label={t('btn.delete')} tabIndex={open ? 0 : -1}
        onClick={() => { close(); onDelete(); }}>
        <TrashIcon />
        <span>{t('btn.delete')}</span>
      </button>
      <div class="swipe-content" ref={content} onPointerDown={down} onPointerMove={move} onPointerUp={(e) => end(e, false)} onPointerCancel={(e) => end(e, true)} onClickCapture={click}>
        {children}
      </div>
    </div>
  );
}
