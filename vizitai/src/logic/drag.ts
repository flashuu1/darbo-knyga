import { hhmm } from './time';

export const HOLD_MS = 400;
export const MOVE_THRESHOLD_PX = 8;
export const EDGE_ZONE_PX = 24;
export const EDGE_HOLD_MS = 600;
export const AUTOSCROLL_ZONE_PX = 40;

export const exceedsThreshold = (dx: number, dy: number) => Math.hypot(dx, dy) > MOVE_THRESHOLD_PX;
export const edgeSide = (x: number, width: number): -1 | 0 | 1 => (x < EDGE_ZONE_PX ? -1 : x > width - EDGE_ZONE_PX ? 1 : 0);

/** The 15-minute-snapped start for an entry whose top edge is dropped at `y - grabDY`, clamped to the visible rows. */
export function startFromY(o: { date: string; rangeStartMin: number; rows: number; colTop: number; colHeight: number; y: number; grabDY: number }): string {
  const rowPx = o.colHeight / o.rows;
  const raw = o.rangeStartMin + ((o.y - o.grabDY - o.colTop) / rowPx) * 15;
  const lo = o.rangeStartMin, hi = o.rangeStartMin + (o.rows - 1) * 15;
  const snapped = Math.min(hi, Math.max(lo, Math.round(raw / 15) * 15));
  return `${o.date}T${hhmm(snapped)}`;
}
