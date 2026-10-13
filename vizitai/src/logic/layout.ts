export function layoutColumns(blocks: { id: string; start: number; end: number }[]): Map<string, { col: number; cols: number }> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: typeof sorted = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const colEnds: number[] = [];
    const assign = new Map<string, number>();
    for (const b of cluster) {
      let c = colEnds.findIndex((e) => e <= b.start);
      if (c < 0) { c = colEnds.length; colEnds.push(b.end); } else colEnds[c] = b.end;
      assign.set(b.id, c);
    }
    for (const b of cluster) out.set(b.id, { col: assign.get(b.id)!, cols: colEnds.length });
    cluster = [];
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = cluster.length === 1 ? b.end : Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

export interface Lane { col: number; cols: number }
export interface OverflowGroup { start: number; ids: string[]; col: number; cols: number }

/**
 * Side-by-side lanes for overlapping blocks, capped at `maxCols` lanes. A cluster that needs more
 * lanes keeps its first `maxCols - 1` lanes as they are; everything that would land in a later lane
 * is gathered into "+N" groups (one per start time) in the last lane. Starts sit on the 15-minute
 * grid and a group is one row tall, so groups never overlap each other or the lanes beside them.
 */
export function layoutLanes(blocks: { id: string; start: number; end: number }[], maxCols: number): { placed: Map<string, Lane>; overflow: OverflowGroup[] } {
  const base = layoutColumns(blocks);
  const placed = new Map<string, Lane>();
  const groups = new Map<number, OverflowGroup>();
  for (const b of [...blocks].sort((x, y) => x.start - y.start || x.end - y.end)) {
    const l = base.get(b.id)!;
    if (l.cols <= maxCols) placed.set(b.id, l);
    else if (l.col < maxCols - 1) placed.set(b.id, { col: l.col, cols: maxCols });
    else {
      const g = groups.get(b.start) ?? { start: b.start, ids: [], col: maxCols - 1, cols: maxCols };
      g.ids.push(b.id);
      groups.set(b.start, g);
    }
  }
  return { placed, overflow: [...groups.values()] };
}

const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
/** Hours shown before the start and after the end of the working day, so the edges (and early or late bookings) stay reachable. */
export const RANGE_PAD_MIN = 60;

export function visibleRange(
  s: { dayStart: string; dayEnd: string },
  entries: { appt: { start: string }; minutes: number }[],
): { startMin: number; endMin: number } {
  let lo = Math.max(0, toMin(s.dayStart) - RANGE_PAD_MIN), hi = Math.min(1440, toMin(s.dayEnd) + RANGE_PAD_MIN);
  for (const e of entries) {
    const m = toMin(e.appt.start.slice(11, 16));
    lo = Math.min(lo, m);
    hi = Math.max(hi, Math.min(m + e.minutes, 1440));
  }
  return { startMin: Math.floor(lo / 60) * 60, endMin: Math.min(1440, Math.ceil(hi / 60) * 60) };
}
