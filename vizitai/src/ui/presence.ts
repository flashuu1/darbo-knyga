import { useEffect, useState } from 'preact/hooks';

export const EXIT_MS = 300;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Keeps the last non-null value mounted for EXIT_MS after it turns null, so a layer can play its exit
 * animation. Returns the value to render (or null) and whether it is currently leaving.
 */
export function usePresence<T>(value: T | null): [T | null, boolean] {
  const [shown, setShown] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) { setShown(value); return; }
    if (shown === null) return;
    if (reduced()) { setShown(null); return; }
    const id = window.setTimeout(() => setShown(null), EXIT_MS);
    return () => clearTimeout(id);
  }, [value]);
  const leaving = value === null && shown !== null && !reduced();
  return [value ?? (reduced() ? null : shown), leaving];
}
