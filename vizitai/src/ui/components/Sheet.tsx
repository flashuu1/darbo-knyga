import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/**
 * One consistent popup for the whole app.
 *  - 'bottom': content-height bottom sheet (max 100dvh minus the status bar). Swipe down on it from ANYWHERE
 *              (when its content is not scrolled) or on its handle to dismiss, like Apple's own sheets.
 *  - 'full':   full-height modal under the status bar (the booking flow), swipe down on its header to dismiss
 *  - 'dialog': a card in the upper part of the screen for forms with a keyboard (no swipe; the keyboard
 *              cannot cover it because it sits above where the keyboard comes up)
 * The document never scrolls and sheets never resize with the keyboard; only `.sheet-body` scrolls.
 * Enter/exit animations are CSS (see styles.css); Sheets.tsx keeps a closing layer mounted until its exit finishes.
 */
export type SheetVariant = 'bottom' | 'full' | 'dialog';
const CLOSE_DISTANCE = 96; // px dragged down that closes
const CLOSE_VELOCITY = 0.6; // px/ms flick that closes
const NO_SWIPE = '.wheel, .picker-months, input, textarea, select, [data-no-sheet-swipe]'; // things that scroll or type sideways/vertically themselves

export function Sheet({ title, left, right, bar, onClose, onBackdrop, children, testId = 'sheet', variant = 'bottom' }: {
  title: string; left?: ComponentChildren; right?: ComponentChildren; onClose: () => void;
  /** A fixed bar at the bottom of the screen (above the keyboard while it is up), outside the sheet card. */
  bar?: ComponentChildren;
  /** Tap on the dimmed area; defaults to onClose. */
  onBackdrop?: () => void;
  children: ComponentChildren; testId?: string; variant?: SheetVariant;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const bodyEl = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number } | null>(null);
  const closeFn = useRef(onClose);
  closeFn.current = onClose;
  const swipeable = variant !== 'dialog';

  const follow = (dy: number) => {
    const el = sheet.current;
    if (!el) return;
    el.style.transform = `translateY(${dy}px)`;
    if (back.current) back.current.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / (el.offsetHeight || 1)));
  };
  const release = (dy: number, velocity: number, cancelled: boolean) => {
    const el = sheet.current;
    if (!el) return;
    if (!cancelled && (dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY)) {
      el.style.transition = 'transform var(--t-med) var(--ease-in)';
      el.style.transform = 'translateY(100%)';
      if (back.current) { back.current.style.transition = 'opacity var(--t-med) var(--ease-in)'; back.current.style.opacity = '0'; }
      window.setTimeout(() => closeFn.current(), 200);
    } else {
      el.style.transition = 'transform var(--t-med) var(--ease-spring)';
      el.style.transform = '';
      if (back.current) { back.current.style.transition = 'opacity var(--t-med) var(--ease-out)'; back.current.style.opacity = ''; }
      window.setTimeout(() => { el.style.transition = ''; if (back.current) back.current.style.transition = ''; }, 320);
    }
  };

  // Handle and header (pointer events; touch-action none there)
  const down = (e: PointerEvent) => {
    if (!swipeable || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, label')) return; // never steal a tap
    drag.current = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (sheet.current) sheet.current.style.transition = 'none';
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const raw = e.clientY - d.y0;
    d.dy = raw > 0 ? raw : raw / 6; // rubber-band when pulled up
    follow(d.dy);
  };
  const end = (e: PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    release(d.dy, d.dy / Math.max(1, performance.now() - d.t0), cancelled);
  };

  // Anywhere else on a bottom sheet (touch): a downward swipe that starts while the content is not scrolled
  useEffect(() => {
    const el = sheet.current;
    if (!el || variant !== 'bottom') return;
    let t: { x0: number; y0: number; t0: number; dy: number; active: boolean; ok: boolean } | null = null;
    const start = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      t = null;
      if (e.touches.length !== 1 || target.closest('.sheet-top') || target.closest(NO_SWIPE)) return; // the handle has its own gesture
      const p = e.touches[0]!;
      t = { x0: p.clientX, y0: p.clientY, t0: performance.now(), dy: 0, active: false, ok: (bodyEl.current?.scrollTop ?? 0) <= 0 };
    };
    const moveT = (e: TouchEvent) => {
      if (!t || !t.ok) return;
      const p = e.touches[0];
      if (!p) return;
      const dy = p.clientY - t.y0, dx = p.clientX - t.x0;
      if (!t.active) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) && (bodyEl.current?.scrollTop ?? 0) <= 0) { t.active = true; el.style.transition = 'none'; }
        else { t.ok = false; return; } // a sideways, upward or scrolling touch: not ours
      }
      e.preventDefault();
      t.dy = dy;
      follow(dy > 0 ? dy : dy / 6);
    };
    const endT = (cancelled: boolean) => {
      const s = t;
      t = null;
      if (s?.active) release(s.dy, s.dy / Math.max(1, performance.now() - s.t0), cancelled);
    };
    const up = () => endT(false), cancel = () => endT(true);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', moveT, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', moveT);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', cancel);
    };
  }, [variant]);

  return (
    <div class="layer">
      {/* preventDefault on mousedown keeps focus where it is, so onBackdrop sees the real focus state */}
      <div ref={back} class="backdrop" onMouseDown={(e) => e.preventDefault()} onClick={onBackdrop ?? onClose} />
      <div ref={sheet} class={`sheet ${variant}`} role="dialog" aria-label={title} data-testid={testId}>
        <div class="sheet-top" onPointerDown={down} onPointerMove={move} onPointerUp={(e) => end(e, false)} onPointerCancel={(e) => end(e, true)}>
          {variant !== 'dialog' && <div class="grabber" />}
          <header class="sheet-nav">
            <div class="side l">{left}</div>
            <h2>{title}</h2>
            <div class="side r">{right}</div>
          </header>
        </div>
        <div class="sheet-body" ref={bodyEl}>{children}</div>
      </div>
      {bar}
    </div>
  );
}
