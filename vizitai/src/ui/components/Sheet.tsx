import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

// While any sheet is open, mirror the visual viewport (which shrinks when the iOS keyboard is up;
// dvh does not) into --vvh / --vvtop so the sheet stays above the keyboard. Ref-counted: the
// listeners and the variables are removed when the last sheet closes.
let users = 0;
let release: (() => void) | null = null;
function trackVisualViewport(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  if (users++ === 0) {
    const root = document.documentElement.style;
    const update = () => {
      root.setProperty('--vvh', `${vv.height}px`);
      root.setProperty('--vvtop', `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    release = () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.removeProperty('--vvh');
      root.removeProperty('--vvtop');
    };
  }
  return () => {
    if (--users === 0) { release?.(); release = null; }
  };
}

export function Sheet({ title, left, right, onClose, onBackdrop, children, testId = 'sheet' }: {
  title: string; left?: ComponentChildren; right?: ComponentChildren; onClose: () => void;
  /** Tap on the dimmed area; defaults to onClose. */
  onBackdrop?: () => void;
  children: ComponentChildren; testId?: string;
}) {
  useEffect(trackVisualViewport, []);
  return (
    <div class="sheet-root">
      {/* preventDefault on mousedown keeps focus where it is, so onBackdrop sees the real focus state */}
      <div class="backdrop" onMouseDown={(e) => e.preventDefault()} onClick={onBackdrop ?? onClose} />
      <div class="sheet" role="dialog" aria-label={title} data-testid={testId}>
        <div class="grabber" />
        <header class="sheet-nav">
          <div class="side l">{left}</div>
          <h2>{title}</h2>
          <div class="side r">{right}</div>
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
