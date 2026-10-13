import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

/**
 * One consistent popup for the whole app.
 *  - 'bottom': content-height bottom sheet (max 100dvh minus the status bar), swipe down to dismiss
 *  - 'full':   full-height modal under the status bar (the booking flow), swipe down on the header to dismiss
 *  - 'dialog': a card in the upper part of the screen for forms with a keyboard (no swipe; the keyboard
 *              cannot cover it because it sits above where the keyboard comes up)
 * The document never scrolls and sheets never resize with the keyboard; only `.sheet-body` scrolls.
 * Enter/exit animations are CSS (see styles.css); Sheets.tsx keeps a closing layer mounted until its exit finishes.
 */
export type SheetVariant = 'bottom' | 'full' | 'dialog';
const CLOSE_DISTANCE = 96; // px dragged down that closes
const CLOSE_VELOCITY = 0.6; // px/ms flick that closes

export function Sheet({ title, left, right, onClose, onBackdrop, children, testId = 'sheet', variant = 'bottom' }: {
  title: string; left?: ComponentChildren; right?: ComponentChildren; onClose: () => void;
  /** Tap on the dimmed area; defaults to onClose. */
  onBackdrop?: () => void;
  children: ComponentChildren; testId?: string; variant?: SheetVariant;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number } | null>(null);
  const swipeable = variant !== 'dialog';

  const down = (e: PointerEvent) => {
    if (!swipeable || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, label')) return; // never steal a tap
    drag.current = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (sheet.current) sheet.current.style.transition = 'none';
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !sheet.current) return;
    const raw = e.clientY - d.y0;
    d.dy = raw > 0 ? raw : raw / 6; // rubber-band when pulled up
    sheet.current.style.transform = `translateY(${d.dy}px)`;
    if (back.current) back.current.style.opacity = String(Math.max(0, 1 - Math.max(0, d.dy) / (sheet.current.offsetHeight || 1)));
  };
  const end = (e: PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !sheet.current) return;
    drag.current = null;
    const el = sheet.current;
    const velocity = d.dy / Math.max(1, performance.now() - d.t0);
    if (!cancelled && (d.dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY)) {
      el.style.transition = 'transform var(--t-med) var(--ease-in)';
      el.style.transform = 'translateY(100%)';
      if (back.current) { back.current.style.transition = 'opacity var(--t-med) var(--ease-in)'; back.current.style.opacity = '0'; }
      window.setTimeout(onClose, 200);
    } else {
      el.style.transition = 'transform var(--t-med) var(--ease-spring)';
      el.style.transform = '';
      if (back.current) { back.current.style.transition = 'opacity var(--t-med) var(--ease-out)'; back.current.style.opacity = ''; }
      window.setTimeout(() => { el.style.transition = ''; if (back.current) back.current.style.transition = ''; }, 320);
    }
  };

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
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
