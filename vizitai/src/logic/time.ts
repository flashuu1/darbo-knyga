// Wall-clock arithmetic: components are treated as UTC fields so DST never shifts anything.
const RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function parse(s: string): number {
  const m = RE.exec(s);
  if (!m) throw new Error(`Bad local datetime: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}
export function format(min: number): string {
  const d = new Date(min * 60000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export const addMinutes = (s: string, n: number) => format(parse(s) + n);
export const datePart = (s: string) => s.slice(0, 10);
export const timePart = (s: string) => s.slice(11, 16);
export const addDays = (date: string, n: number) => datePart(addMinutes(`${date.slice(0, 10)}T00:00`, n * 1440));
export const minutesOfDay = (s: string) => +s.slice(11, 13) * 60 + +s.slice(14, 16);
export const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function snap(s: string, slot = 15, mode: 'round' | 'floor' | 'ceil' = 'round'): string {
  const m = parse(s);
  const r = ((m % slot) + slot) % slot;
  const base = m - r;
  const v = mode === 'floor' ? base : mode === 'ceil' ? (r ? base + slot : base) : r * 2 >= slot ? base + slot : base;
  return format(v);
}
export function weekStart(date: string): string {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}
export function nowLocal(d: Date = new Date()): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const todayStr = (d?: Date) => datePart(nowLocal(d));
