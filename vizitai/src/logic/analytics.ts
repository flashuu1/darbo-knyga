import { datePart, nowLocal } from './time';

/** One client visit as the statistics see it. */
export interface VisitRec { clientId: string; start: string; status: 'booked' | 'cancelled' | 'noshow'; minutes: number; cents: number | null; service: string }
/** A "Nedirbu" entry: time she was not available. */
export interface OffRec { start: string; minutes: number }
export interface AnalyticsInput {
  now: string; visits: VisitRec[]; off: OffRec[]; clients: { id: string; name: string }[]; dayStart: string; dayEnd: string;
}

export const MONTHS = 24;
/** Time-of-day bands of the "when do they come" map: before 11, 11-14, 14-17, from 17. */
export const BAND_COUNT = 4;
export const bandOf = (hour: number) => (hour < 11 ? 0 : hour < 14 ? 1 : hour < 17 ? 2 : 3);

export interface Person {
  id: string; name: string;
  /** Visits and money per month (index like Analytics.keys). */
  visits: number[]; cents: number[];
  /** Month index of the first visit; negative = before the 24 months shown. null = no visits yet. */
  firstMonth: number | null;
  total: number; spent: number; lastStart: string | null; hasUpcoming: boolean;
}
export interface Gap { id: string; name: string; gapDays: number; sinceDays: number; ratio: number }
export interface Analytics {
  /** 'YYYY-MM' per month, oldest first; the last one is the current month. */
  keys: string[];
  visits: number[]; cents: number[]; avgCents: number[];
  newClients: number[]; totalClients: number[];
  /** Hours: booked, free, not available ("Nedirbu"), and the share of the available time that was booked (percent). */
  booked: number[]; free: number[]; off: number[]; util: number[];
  /** Earnings per booked hour, in cents. */
  perHour: number[];
  missed: number[]; cancelled: number[]; lostCents: number[];
  /** Money per month by service. */
  services: { name: string; cents: number[] }[];
  /** [month][weekday 0 = Monday][band] */
  heat: number[][][];
  /** [month][day of month - 1]: visits and money, for the month page. */
  days: { visits: number[][]; cents: number[][] };
  people: Person[];
  gaps: Gap[];
  avgGapDays: number;
  hasData: boolean;
}

const monthsBetween = (fromYm: string, toYm: string) => (+toYm.slice(0, 4) - +fromYm.slice(0, 4)) * 12 + (+toYm.slice(5, 7) - +fromYm.slice(5, 7));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${datePart(b)}T12:00:00Z`) - Date.parse(`${datePart(a)}T12:00:00Z`)) / 86_400_000);
const weekdayOf = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
const zeros = () => new Array<number>(MONTHS).fill(0);
const pad2 = (n: number) => String(n).padStart(2, '0');

/** The month keys, oldest first, ending with the month of `now`. */
export function monthKeys(now: string): string[] {
  const y = +now.slice(0, 4), m = +now.slice(5, 7);
  return Array.from({ length: MONTHS }, (_, i) => {
    const k = y * 12 + (m - 1) - (MONTHS - 1 - i);
    return `${Math.floor(k / 12)}-${pad2((k % 12) + 1)}`;
  });
}

export function buildAnalytics(input: AnalyticsInput): Analytics {
  const { now, dayStart, dayEnd } = input;
  const keys = monthKeys(now), cur = keys[MONTHS - 1]!;
  const idx = (start: string) => MONTHS - 1 - monthsBetween(start.slice(0, 7), cur); // may be < 0 (older) or > 23 (future)
  const today = datePart(now);
  const people = new Map<string, Person>(input.clients.map((c) => [c.id, { id: c.id, name: c.name, visits: zeros(), cents: zeros(), firstMonth: null, total: 0, spent: 0, lastStart: null, hasUpcoming: false }]));
  const visits = zeros(), cents = zeros(), bookedMin = zeros(), missed = zeros(), cancelled = zeros(), paidCount = zeros();
  const heat = Array.from({ length: MONTHS }, () => Array.from({ length: 7 }, () => new Array<number>(BAND_COUNT).fill(0)));
  const dayVisits = Array.from({ length: MONTHS }, () => new Array<number>(31).fill(0)), dayCents = Array.from({ length: MONTHS }, () => new Array<number>(31).fill(0));
  const svc = new Map<string, number[]>();
  const starts = new Map<string, string[]>(); // booked past visit starts per client
  const first = new Map<string, string>();    // the very first booked past visit of each client
  let paidAll = 0, paidSum = 0;
  for (const v of input.visits) {
    const p = people.get(v.clientId);
    if (v.start > now) { if (v.status === 'booked' && p) p.hasUpcoming = true; continue; }
    const m = idx(v.start);
    if (v.status === 'noshow') { if (m >= 0) missed[m]!++; continue; }
    if (v.status === 'cancelled') { if (m >= 0) cancelled[m]!++; continue; }
    if (p) {
      p.total++; if (v.cents !== null) p.spent += v.cents;
      if (!p.lastStart || v.start > p.lastStart) p.lastStart = v.start;
      if (m >= 0) { p.visits[m]!++; if (v.cents !== null) p.cents[m]! += v.cents; }
      (starts.get(v.clientId) ?? starts.set(v.clientId, []).get(v.clientId)!).push(v.start);
      if (!first.has(v.clientId) || v.start < first.get(v.clientId)!) first.set(v.clientId, v.start);
    }
    if (v.cents !== null) { paidAll++; paidSum += v.cents; }
    if (m < 0) continue;
    visits[m]!++; bookedMin[m]! += v.minutes;
    dayVisits[m]![+v.start.slice(8, 10) - 1]!++;
    if (v.cents !== null) dayCents[m]![+v.start.slice(8, 10) - 1]! += v.cents;
    if (v.cents !== null) { cents[m]! += v.cents; paidCount[m]!++; const a = svc.get(v.service) ?? svc.set(v.service, zeros()).get(v.service)!; a[m]! += v.cents; }
    heat[m]![weekdayOf(datePart(v.start))]![bandOf(+v.start.slice(11, 13))]!++;
  }
  for (const [id, s] of first) { const p = people.get(id)!; p.firstMonth = idx(s); }

  const overall = paidAll ? paidSum / paidAll : 0;
  const avgCents = visits.map((_, m) => (paidCount[m] ? cents[m]! / paidCount[m]! : 0));
  const lostCents = visits.map((_, m) => Math.round((missed[m]! + cancelled[m]!) * (avgCents[m] || overall)));
  const newClients = zeros(); let older = 0;
  for (const p of people.values()) { if (p.firstMonth === null) continue; if (p.firstMonth < 0) older++; else newClients[p.firstMonth]!++; }
  const totalClients = zeros(); let run = older;
  for (let m = 0; m < MONTHS; m++) { run += newClients[m]!; totalClients[m] = run; }

  // Hours: working days (Monday to Saturday) of the month up to today, times the length of her working day
  const dayHours = Math.max(0, (toMin(dayEnd) - toMin(dayStart)) / 60);
  const offH = zeros();
  for (const o of input.off) { const m = idx(o.start); if (m >= 0 && m < MONTHS && o.start <= now) offH[m]! += o.minutes / 60; }
  const booked = bookedMin.map((x) => x / 60), free = zeros(), util = zeros(), perHour = zeros(), off = zeros();
  keys.forEach((k, m) => {
    const y = +k.slice(0, 4), mo = +k.slice(5, 7);
    const last = k === cur ? +today.slice(8, 10) : new Date(Date.UTC(y, mo, 0)).getUTCDate();
    let days = 0;
    for (let d = 1; d <= last; d++) if (weekdayOf(`${k}-${pad2(d)}`) !== 6) days++;
    const avail = days * dayHours, away = Math.min(offH[m]!, avail), open = Math.max(0, avail - away);
    off[m] = away; free[m] = Math.max(0, open - booked[m]!);
    util[m] = open > 0 ? Math.min(100, Math.round(booked[m]! / open * 100)) : 0;
    perHour[m] = booked[m]! > 0 ? Math.round(cents[m]! / booked[m]!) : 0;
  });

  // How often each client comes, and who is past their usual rhythm
  const gaps: Gap[] = []; let gapSum = 0, gapN = 0;
  for (const [id, list] of starts) {
    if (list.length < 3) continue;
    const s = [...list].sort(), p = people.get(id)!;
    const gapDays = Math.max(1, daysBetween(s[0]!, s[s.length - 1]!) / (s.length - 1));
    gapSum += gapDays; gapN++;
    const sinceDays = daysBetween(s[s.length - 1]!, today);
    gaps.push({ id, name: p.name, gapDays, sinceDays, ratio: sinceDays / gapDays });
  }
  const late = gaps.filter((g) => g.ratio >= 1.2 && g.sinceDays <= 240 && !people.get(g.id)!.hasUpcoming).sort((a, b) => b.ratio - a.ratio);

  return {
    keys, visits, cents, avgCents, newClients, totalClients, booked, free, off, util, perHour, missed, cancelled, lostCents,
    services: [...svc].map(([name, c]) => ({ name, cents: c })).sort((a, b) => b.cents.reduce((x, y) => x + y, 0) - a.cents.reduce((x, y) => x + y, 0)),
    heat, days: { visits: dayVisits, cents: dayCents }, people: [...people.values()], gaps: late, avgGapDays: gapN ? gapSum / gapN : 0,
    hasData: visits.some((v) => v > 0) || input.visits.length > 0,
  };
}

/* ---------- what a chosen period shows ---------- */
/** Inclusive month indexes into Analytics. */
export interface Win { from: number; to: number }
export const clampWin = (w: Win): Win => {
  const to = Math.max(2, Math.min(MONTHS - 1, Math.round(w.to)));
  return { from: Math.max(0, Math.min(to - 2, Math.round(w.from))), to };
};
export const presetWin = (months: number): Win => ({ from: MONTHS - months, to: MONTHS - 1 });
export const winLen = (w: Win) => w.to - w.from + 1;
export const slice = (a: number[], w: Win) => a.slice(w.from, w.to + 1);
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);

/** Percent change against the period right before this one (same length); null when there is no such period or nothing to compare. */
export function delta(a: number[], w: Win, agg: (x: number[]) => number = sum): number | null {
  const n = winLen(w);
  if (w.from - n < 0) return null;
  const prev = agg(a.slice(w.from - n, w.from));
  if (!prev) return null;
  return Math.round((agg(slice(a, w)) - prev) / prev * 100);
}
export function records(a: Analytics, w: Win) {
  // a tie goes to the more recent month
  const best = (arr: number[]) => { const s = slice(arr, w); const m = Math.max(...s); return m > 0 ? { month: w.from + s.lastIndexOf(m), value: m } : null; };
  const wd = new Array<number>(7).fill(0);
  for (let m = w.from; m <= w.to; m++) for (let d = 0; d < 7; d++) wd[d]! += sum(a.heat[m]![d]!);
  const top = Math.max(...wd);
  return { busiest: best(a.visits), richest: best(a.cents), bestDay: top > 0 ? { weekday: wd.indexOf(top), value: top } : null };
}
export function heatOf(a: Analytics, w: Win): number[][] {
  const out = Array.from({ length: 7 }, () => new Array<number>(BAND_COUNT).fill(0));
  for (let m = w.from; m <= w.to; m++) for (let d = 0; d < 7; d++) for (let b = 0; b < BAND_COUNT; b++) out[d]![b]! += a.heat[m]![d]![b]!;
  return out;
}
export interface RankRow { id: string; name: string; value: number; trend: number[]; total: number; spent: number; lastStart: string | null }
export function ranking(a: Analytics, w: Win, by: 'visits' | 'cents', n: number): RankRow[] {
  return a.people
    .map((p) => { const trend = slice(by === 'visits' ? p.visits : p.cents, w); return { id: p.id, name: p.name, value: sum(trend), trend, total: p.total, spent: p.spent, lastStart: p.lastStart }; })
    .filter((r) => r.value > 0)
    .sort((x, y) => y.value - x.value || x.name.localeCompare(y.name, 'lt'))
    .slice(0, n);
}
/** Of the clients who came for the first time in the period: what share reached their 1st, 2nd, 3rd... visit. */
export function retention(a: Analytics, w: Win, steps = 8) {
  const group = a.people.filter((p) => p.firstMonth !== null && p.firstMonth >= w.from && p.firstMonth <= w.to);
  return { count: group.length, reach: Array.from({ length: steps }, (_, i) => (group.length ? Math.round(group.filter((p) => p.total >= i + 1).length / group.length * 100) : 0)) };
}
export function serviceSplit(a: Analytics, w: Win) {
  return a.services.map((s) => ({ name: s.name, cents: sum(slice(s.cents, w)) }));
}

/** "šiandien", "vakar", "prieš 5 d." parts for the contacts list. */
export function agoParts(lastDate: string | null, now: string = nowLocal()): { key: 'today' | 'yesterday' | 'days' | 'weeks' | 'months'; n: number } | null {
  if (!lastDate) return null;
  const d = daysBetween(lastDate, now);
  if (d <= 0) return { key: 'today', n: 0 };
  if (d === 1) return { key: 'yesterday', n: 1 };
  if (d < 14) return { key: 'days', n: d };
  if (d < 60) return { key: 'weeks', n: Math.round(d / 7) };
  return { key: 'months', n: Math.round(d / 30) };
}
