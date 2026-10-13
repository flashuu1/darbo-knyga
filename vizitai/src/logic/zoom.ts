/** Vertical zoom of the calendar: 1 = the normal row height; smaller shows more of the day at once. */
export const ZOOM_MIN = 0.2; // small enough to see a whole working day without scrolling
export const ZOOM_MAX = 2.4;
export const ZOOM_DEFAULT = 1;
const BASE_ROW_PX = 44;

export const clampZoom = (z: number): number => (Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : ZOOM_DEFAULT);

/** A little more than 1:1, so a small pinch is already a clear change. */
const PINCH_GAIN = 1.3;

/**
 * Like a map: fingers APART zoom in (bigger hours), fingers TOGETHER zoom out (more of the day in view),
 * so the new zoom is the old one scaled by (current distance / start distance).
 */
export const pinchZoom = (z0: number, d0: number, d: number): number => (d0 > 0 && d > 0 ? clampZoom(z0 * Math.pow(d / d0, PINCH_GAIN)) : clampZoom(z0));

/** Rounds to a whole number of pixels per row, so the grid lines are crisp once the pinch ends. */
export const snapZoom = (z: number): number => clampZoom(Math.round(z * BASE_ROW_PX) / BASE_ROW_PX);

/** Every how many hours a time label (and hour line) is drawn: one hour only gets a label when it has room. */
export const labelStep = (zoom: number): number => {
  const hourPx = zoom * BASE_ROW_PX * 4;
  return [1, 2, 3, 6, 12].find((s) => s * hourPx >= 72) ?? 12;
};

/** How much room one 15-minute row gets, so entries can drop details when it gets small. */
export type Density = 'normal' | 'tight' | 'tiny';
export const densityFor = (zoom: number): Density => {
  const px = zoom * BASE_ROW_PX;
  return px < 20 ? 'tiny' : px < 32 ? 'tight' : 'normal';
};

const KEY = 'vizitai.zoom';
export const loadZoom = (): number => {
  try { return clampZoom(Number(localStorage.getItem(KEY) ?? ZOOM_DEFAULT)); } catch { return ZOOM_DEFAULT; }
};
export const saveZoom = (z: number) => { try { localStorage.setItem(KEY, String(z)); } catch { /* private mode: not remembered */ } };
