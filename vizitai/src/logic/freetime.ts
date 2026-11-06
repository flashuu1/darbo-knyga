import { datePart, minutesOfDay } from './time';

/**
 * Where there is room in the week, and which room to suggest. Pure: the entries of the week in, free slots out.
 *  - Only the "recommended time" window counts (11:00–18:00 unless she changes it), inside her working hours.
 *  - Busy: every booked visit and every entry of her own (Nedirbu too). Cancelled visits, no-shows and expenses do not block.
 *  - Never offered: days she does not work, days that are over, and the part of today that is over.
 *  - A gap fits a service when it is at least as long as the service. The suggested start is the start of the gap, so what is left
 *    stays in one piece.
 */
export const REC_FROM = '11:00', REC_TO = '18:00';
/** `free`: the most room around it, on a lighter day. `fit`: the gap that fits best, so big gaps stay for long services. */
export type RecMode = 'free' | 'fit';
export interface FreeSettings { dayStart: string; dayEnd: string; workDays?: number[]; recFrom?: string; recTo?: string; recMode?: RecMode }
export interface Busy { start: string; minutes: number }
/** Minutes of the day. */
export interface Gap { date: string; start: number; end: number }
export interface FreeSlot {
  date: string; start: number; end: number; gap: Gap;
  /** what is left of the gap after this visit */
  slack: number;
  /** free minutes that day inside the window, and as a share of the window */
  dayFree: number; dayFrac: number;
  /** the day's place in the week shown (0 = first): earlier days are suggested first, all else equal */
  order: number;
}

const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
/** Monday = 0. */
export const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const MIN_GAP = 15;

/** The window, cut to her working hours; `to <= from` means there is nothing to suggest. */
export function recWindow(s: FreeSettings): [number, number] {
  return [Math.max(toMin(s.recFrom ?? REC_FROM), toMin(s.dayStart)), Math.min(toMin(s.recTo ?? REC_TO), toMin(s.dayEnd))];
}

/** What blocks the chair: booked visits and her own entries; not expenses, cancelled visits or no-shows. */
export function busyFrom(entries: { appt: { start: string; status: string; kind: string }; minutes: number }[]): Busy[] {
  return entries.filter((e) => e.appt.status === 'booked' && e.appt.kind !== 'expense').map((e) => ({ start: e.appt.start, minutes: e.minutes }));
}

export function freeGaps(dates: string[], busy: Busy[], s: FreeSettings, now: string): Gap[] {
  const [from, to] = recWindow(s);
  if (to <= from) return [];
  const today = datePart(now), days = s.workDays ?? [0, 1, 2, 3, 4, 5, 6];
  const out: Gap[] = [];
  for (const date of dates) {
    if (date < today || !days.includes(weekdayOf(date))) continue;
    const lo = date === today ? Math.max(from, Math.ceil(minutesOfDay(now) / 15) * 15) : from;
    if (lo >= to) continue;
    const spans = busy.filter((b) => datePart(b.start) === date)
      .map((b) => [Math.max(lo, minutesOfDay(b.start)), Math.min(to, minutesOfDay(b.start) + b.minutes)] as const)
      .filter(([a, z]) => z > a)
      .sort((a, b) => a[0] - b[0]);
    let at = lo;
    for (const [a, z] of spans) { if (a - at >= MIN_GAP) out.push({ date, start: at, end: a }); at = Math.max(at, z); }
    if (to - at >= MIN_GAP) out.push({ date, start: at, end: to });
  }
  return out;
}

/** The gaps a service of `minutes` fits in, one suggestion per gap. */
export function slotsFor(gaps: Gap[], minutes: number, dates: string[], s: FreeSettings): FreeSlot[] {
  const [from, to] = recWindow(s), total = Math.max(1, to - from);
  const free = new Map<string, number>();
  for (const g of gaps) free.set(g.date, (free.get(g.date) ?? 0) + g.end - g.start);
  return gaps.filter((g) => g.end - g.start >= minutes).map((g) => {
    const dayFree = free.get(g.date) ?? 0;
    return { date: g.date, start: g.start, end: g.start + minutes, gap: g, slack: g.end - g.start - minutes, dayFree, dayFrac: Math.min(1, dayFree / total), order: Math.max(0, dates.indexOf(g.date)) };
  });
}

const score = (c: FreeSlot, mode: RecMode) => mode === 'fit' ? -c.slack * 100 - c.order * 4 : c.slack * 2 + c.dayFree * 0.6 - c.order * 8 - Math.abs(c.start - 15 * 60) * 0.05;
/** Best first. Ties go to the earlier day, then the earlier time. */
export function rankSlots(slots: FreeSlot[], mode: RecMode): FreeSlot[] {
  return [...slots].sort((a, b) => score(b, mode) - score(a, mode) || a.order - b.order || a.start - b.start);
}
export const slotKey = (c: { date: string; start: number }) => `${c.date}T${String(Math.floor(c.start / 60)).padStart(2, '0')}:${String(c.start % 60).padStart(2, '0')}`;
