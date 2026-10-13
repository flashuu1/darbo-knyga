import { useEffect, useState } from 'preact/hooks';
import { nowLocal } from '../logic/time';

/**
 * One shared minute clock for the UI (the "now" line, today markers, entries waiting for an amount).
 * It ticks every 30 s and when the app comes back to the foreground; nothing re-renders unless the
 * minute changed. Uses the global Date and timers, so Playwright's page.clock drives it in tests.
 */
export const TICK_MS = 30_000;
let now = nowLocal();
const listeners = new Set<(v: string) => void>();
let timer = 0;

function tick() {
  const v = nowLocal();
  if (v === now) return;
  now = v;
  listeners.forEach((l) => l(v));
}
const onVisible = () => { if (document.visibilityState === 'visible') tick(); };

function start() {
  timer = window.setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', onVisible);
}
function stop() {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
}

export const currentNow = () => { tick(); return now; };

/** The local wall-clock minute, `YYYY-MM-DDTHH:mm`, kept current. */
export function useNow(): string {
  const [v, setV] = useState(currentNow);
  useEffect(() => {
    if (listeners.size === 0) start();
    listeners.add(setV);
    setV(currentNow());
    return () => {
      listeners.delete(setV);
      if (listeners.size === 0) stop();
    };
  }, []);
  return v;
}
