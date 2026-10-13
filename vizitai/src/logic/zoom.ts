/** Vertical zoom of the calendar: 1 = the normal row height; smaller shows more of the day at once. */
export const ZOOM_MIN = 0.2; // small enough to see a whole working day without scrolling
export const ZOOM_MAX = 2.4;
export const ZOOM_DEFAULT = 1;
const BASE_ROW_PX = 44;

export const clampZoom = (z: number): number => (Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : ZOOM_DEFAULT);

/**
 * Pinching OUT (fingers apart) shows more time in the same space, pinching IN makes the hours bigger,
 * so the new zoom is the old one scaled by (start distance / current distance).
 */
export const pinchZoom = (z0: number, d0: number, d: number): number => (d0 > 0 && d > 0 ? clampZoom((z0 * d0) / d) : clampZoom(z0));

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
