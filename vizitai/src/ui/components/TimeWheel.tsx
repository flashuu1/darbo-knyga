import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n/lt';

const ITEM = 44; // px per row (a multiple of 4, so snapping lands on whole pixels)
const pad = (n: number) => String(n).padStart(2, '0');

/** One scrolling column. Scroll it (it snaps) or tap a number; any value is allowed, not just steps. */
function Wheel({ kind, count, value, label, onPick }: { kind: 'h' | 'm'; count: number; value: number; label: string; onPick: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const lastUser = useRef(0);
  const timer = useRef(0);
  const live = useRef(value); // the row in the middle right now (moves with the scroll, before the value is settled)

  // Follow the value when it changes from outside (but never fight a finger that is scrolling).
  useEffect(() => {
    const el = box.current;
    if (!el || performance.now() - lastUser.current < 250) return;
    if (Math.abs(el.scrollTop - value * ITEM) > 1) el.scrollTop = value * ITEM;
  }, [value]);
  useEffect(() => { live.current = value; }, [value]);

  const onScroll = () => {
    lastUser.current = performance.now();
    // light up the number under the bar while the wheel is still turning, like the iOS wheel
    const el0 = box.current;
    if (el0) {
      const i = Math.max(0, Math.min(count - 1, Math.round(el0.scrollTop / ITEM)));
      if (i !== live.current) {
        const items = el0.querySelectorAll<HTMLElement>('.wheel-item');
        items[live.current]?.classList.remove('on');
        items[i]?.classList.add('on');
        live.current = i;
      }
    }
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { // settled: read the row that sits in the middle
      const el = box.current;
      if (!el) return;
      const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== value) onPick(i);
    }, 90);
  };
  const tap = (i: number) => { onPick(i); box.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' }); };

  return (
    <div class="wheel" ref={box} onScroll={onScroll} role="listbox" aria-label={label} data-testid={`wheel-${kind}`}>
      <div class="wheel-pad" aria-hidden="true" />
      {Array.from({ length: count }, (_, i) => (
        <button key={i} class={i === value ? 'wheel-item on' : 'wheel-item'} role="option" aria-selected={i === value} data-testid={`wheel-${kind}-${pad(i)}`} onClick={() => tap(i)}>{pad(i)}</button>
      ))}
      <div class="wheel-pad" aria-hidden="true" />
    </div>
  );
}

/** Hours and minutes as two scroll wheels (like the iOS time picker); every minute can be picked. */
export function TimeWheel({ value, onChange }: { value: string; onChange: (hm: string) => void }) {
  const h = +value.slice(0, 2), m = +value.slice(3, 5);
  return (
    <div class="timewheel" data-testid="timewheel">
      <div class="wheel-bar" aria-hidden="true" />
      <Wheel kind="h" count={24} value={h} label={t('wheel.hours')} onPick={(i) => onChange(`${pad(i)}:${pad(m)}`)} />
      <span class="wheel-colon" aria-hidden="true">:</span>
      <Wheel kind="m" count={60} value={m} label={t('wheel.minutes')} onPick={(i) => onChange(`${pad(h)}:${pad(i)}`)} />
    </div>
  );
}
