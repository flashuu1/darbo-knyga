import { MAX_AMOUNT_CENTS } from '../logic/amount';
import { t } from './lt';
const utc = { timeZone: 'UTC' } as const;
const L = 'lt-LT';
const long = new Intl.DateTimeFormat(L, { ...utc, month: 'long', day: 'numeric', weekday: 'long' });
const short = new Intl.DateTimeFormat(L, { ...utc, month: 'long', day: 'numeric' });
const wd = new Intl.DateTimeFormat(L, { ...utc, weekday: 'short' });
const month = new Intl.DateTimeFormat(L, { ...utc, month: 'long' });
const d = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`);

export const formatDayLong = (date: string) => long.format(d(date));
export const formatDayShort = (date: string) => short.format(d(date));
export const weekdayShort = (date: string) => wd.format(d(date));
export const monthName = (date: string) => month.format(d(date));
const build = new Intl.DateTimeFormat(L, { timeZone: 'Europe/Vilnius', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** A build timestamp (ISO, UTC) as Vilnius wall-clock time, e.g. "2026 m. spalio 14 d. 15:42". */
export const formatBuildTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : build.format(d);
};
export const formatWhen = (start: string) =>
  `${formatDayShort(start)}, ${weekdayShort(start)} · ${start.slice(11, 16)}`;

/** 180 -> "3 val.", 90 -> "1 val. 30 min.", 45 -> "45 min." */
export const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h === 0 ? t('dur.m', { n: m }) : m === 0 ? t('dur.h', { n: h }) : t('dur.hm', { h, m });
};

// --- Amounts (integer euro cents) ---
const euro = new Intl.NumberFormat(L, { style: 'currency', currency: 'EUR' });
const plain = (frac: number) => new Intl.NumberFormat(L, { useGrouping: false, minimumFractionDigits: frac, maximumFractionDigits: frac });
const plain0 = plain(0), plain2 = plain(2);
/** 4550 -> "45,50 €" (lt-LT: decimal comma, no-break space before the sign). */
export const formatEuro = (cents: number) => euro.format(cents / 100);
/** The currency sign as lt-LT writes it ("€"), for the suffix of the amount field. */
export const euroSign = euro.formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';
/** The editable form of a stored amount: 4500 -> "45", 4550 -> "45,50" (no grouping, no sign). */
export const formatAmountInput = (cents: number) => (cents % 100 === 0 ? plain0 : plain2).format(cents / 100);
const AMOUNT_RE = /^(\d*)(?:[.,](\d{0,2}))?$/;
/**
 * What she typed -> integer cents, or null when it is not a usable amount. Accepts "45", "45,5", "45.50",
 * "45," and ",5"; surrounding spaces and a trailing "€" are ignored. Parsed as text, never through floats,
 * so "0,29" is exactly 29. Rejects more than two decimals ("1,005"), inner spaces, signs, exponents,
 * letters and anything above MAX_AMOUNT_CENTS.
 */
export function parseAmountInput(text: string): number | null {
  const s = text.trim().replace(/\s*€$/, '');
  const m = AMOUNT_RE.exec(s);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return null;
  const whole = m[1] === '' ? 0 : Number(m[1]);
  const cents = whole * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_AMOUNT_CENTS ? cents : null;
}
