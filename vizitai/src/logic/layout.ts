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

const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

export function visibleRange(
  s: { dayStart: string; dayEnd: string },
  entries: { appt: { start: string }; minutes: number }[],
): { startMin: number; endMin: number } {
  let lo = toMin(s.dayStart), hi = toMin(s.dayEnd);
  for (const e of entries) {
    const m = toMin(e.appt.start.slice(11, 16));
    lo = Math.min(lo, m);
    hi = Math.max(hi, Math.min(m + e.minutes, 1440));
  }
  return { startMin: Math.floor(lo / 60) * 60, endMin: Math.min(1440, Math.ceil(hi / 60) * 60) };
}
