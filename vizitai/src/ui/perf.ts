/**
 * Low Power Mode on an iPhone holds the screen at 30 Hz. Safari offers no way to ask whether it is on, so it is noticed by its
 * effect: animation frames arrive an even 33 ms apart. While that is the case the app marks the page (`html[data-fps="low"]`)
 * and simplifies what costs most per frame (see the block at the end of layers.css), shortens its animations, and the code
 * that animates numbers and charts shortens its own. At 60 or 120 Hz nothing changes at all.
 */
export type FrameMode = 'full' | 'low';
let mode: FrameMode = 'full';
const listeners = new Set<() => void>();
export const frameMode = () => mode;
export const lowFps = () => mode === 'low';
export const onFrameMode = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** How much of its normal length an animation should run in the current mode. */
export const motionScale = () => (mode === 'low' ? 0.65 : 1);

function setMode(m: FrameMode) {
  if (m === mode) return;
  mode = m;
  document.documentElement.dataset.fps = m;
  listeners.forEach((l) => l());
}

/**
 * Decides from the gaps (ms) between animation frames. A clean 30 Hz is "low"; 45 fps or better is "full"; anything else
 * (a busy moment, an uneven rate) is "unsure" and changes nothing, so a hitch is never taken for Low Power Mode.
 */
export function classifyFrames(gaps: number[]): 'low' | 'full' | 'unsure' {
  if (gaps.length < 20) return 'unsure';
  const s = [...gaps].sort((a, b) => a - b);
  const q = (p: number) => s[Math.floor(p * (s.length - 1))]!;
  const med = q(0.5), spread = q(0.75) - q(0.25);
  if (med < 22) return 'full';
  if (med >= 28 && med <= 40 && spread < 6) return 'low';
  return 'unsure';
}

let sampling = false;
function sample(frames = 45, timeoutMs = 3000): Promise<number[]> {
  return new Promise((resolve) => {
    const gaps: number[] = [];
    let last = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (last) gaps.push(now - last);
      last = now;
      if (gaps.length >= frames || now - t0 > timeoutMs || document.visibilityState !== 'visible') { resolve(gaps); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let lowVotes = 0, forced = false;
async function check() {
  if (forced || sampling || document.visibilityState !== 'visible') return;
  sampling = true;
  try {
    const verdict = classifyFrames((await sample()).slice(2)); // the first gaps after a wake-up are not typical
    if (verdict === 'low') { lowVotes++; if (lowVotes >= 2) setMode('low'); }
    else if (verdict === 'full') { lowVotes = 0; setMode('full'); }
  } finally { sampling = false; }
}

/** Starts watching: two quick looks after launch, then every few seconds while the app is in front, and when it comes back. */
export function startFrameMonitor() {
  document.documentElement.dataset.fps = mode;
  if (import.meta.env.MODE === 'e2e') { // tests can pin the mode: /?fps=low
    const f = new URLSearchParams(location.search).get('fps');
    if (f === 'low' || f === 'full') { forced = true; setMode(f); return; }
  }
  window.setTimeout(() => void check(), 1500);
  window.setTimeout(() => void check(), 4000);
  window.setInterval(() => void check(), 8000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lowVotes = 0; window.setTimeout(() => void check(), 600); } });
}
