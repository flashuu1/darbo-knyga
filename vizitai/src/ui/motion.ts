/** True when iOS "Reduce Motion" is on: numbers and charts then jump instead of gliding. */
export const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * Glides a list of numbers from `from` to `to` over `ms`, calling `frame` with the current values on every animation
 * frame (the first call is immediate). Returns a function that stops it. Used for charts, which draw into SVG
 * attributes directly instead of re-rendering the component sixty times a second.
 */
export function tween(from: number[], to: number[], ms: number, frame: (v: number[]) => void): () => void {
  if (prefersReduced() || ms <= 0 || from.every((v, i) => v === to[i])) { frame(to); return () => {}; }
  let raf = 0;
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms), e = ease(k);
    frame(to.map((v, i) => from[i]! + (v - from[i]!) * e));
    if (k < 1) raf = requestAnimationFrame(step);
  };
  frame(from);
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
