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
