import type { CSSProperties } from 'preact';
import { useMemo } from 'preact/hooks';

const BURST_COLORS = ['green', 'yellow', 'orange', 'pink', 'blue', 'teal'];

/** A short burst of confetti: transform and opacity only, over in about 0.65 s. Put it in a positioned box (see `.yay`). */
export function Burst() {
  const parts = useMemo(() => Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.4, d = 70 + Math.random() * 90;
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 24, rot: Math.round((Math.random() - 0.5) * 540), c: BURST_COLORS[i % BURST_COLORS.length]!, s: 6 + Math.round(Math.random() * 5), delay: Math.round(Math.random() * 50), round: i % 3 !== 0 };
  }), []);
  return (
    <div class="burst" aria-hidden="true" data-testid="burst">
      {parts.map((p, i) => (
        <i key={i} class={p.round ? 'round' : ''} style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, '--c': `var(--c-${p.c})`, '--s': `${p.s}px`, '--d': `${p.delay}ms` } as CSSProperties} />
      ))}
    </div>
  );
}
