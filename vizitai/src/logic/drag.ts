import { hhmm } from './time';

export const HOLD_MS = 400;
export const MOVE_THRESHOLD_PX = 8;
export const EDGE_ZONE_PX = 24;
export const EDGE_HOLD_MS = 380; // hold at a screen edge: the first flip to the next day
export const EDGE_REPEAT_MS = 520; // ...and then one more day every this long
export const CHIP_DWELL_MS = 650; // hold over the first/last day of the week strip: page to the next/previous week
export const DROP_STEP_MIN = 5; // dropped times land on whole 5 minutes
export const AUTOSCROLL_ZONE_PX = 40;

export const exceedsThreshold = (dx: number, dy: number) => Math.hypot(dx, dy) > MOVE_THRESHOLD_PX;
export const edgeSide = (x: number, width: number): -1 | 0 | 1 => (x < EDGE_ZONE_PX ? -1 : x > width - EDGE_ZONE_PX ? 1 : 0);

/** The start (on a 5-minute step)  for an entry whose top edge is dropped at `y - grabDY`, clamped to the visible rows. */
export function startFromY(o: { date: string; rangeStartMin: number; rows: number; colTop: number; colHeight: number; y: number; grabDY: number }): string {
  const rowPx = o.colHeight / o.rows;
  const raw = o.rangeStartMin + ((o.y - o.grabDY - o.colTop) / rowPx) * 15;
  const lo = o.rangeStartMin, hi = o.rangeStartMin + (o.rows - 1) * 15;
  const snapped = Math.min(hi, Math.max(lo, Math.round(raw / DROP_STEP_MIN) * DROP_STEP_MIN));
  return `${o.date}T${hhmm(snapped)}`;
}
