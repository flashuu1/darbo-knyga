import type { Entry } from '../db/repo';
import { formatDayShort, weekdayAbbr, weekdayName } from '../i18n/format';
import { t } from '../i18n/lt';
import { addDays, datePart, hhmm, minutesOfDay } from '../logic/time';
import { weekdayOf } from '../logic/freetime';
import { closeSheet, highlight } from './actions';
import { ui } from './store';

const when = (e: Entry) => `${weekdayName(weekdayOf(datePart(e.appt.start))).toLowerCase()}, ${formatDayShort(datePart(e.appt.start))}, ${e.appt.start.slice(11, 16)}${e.service?.name ? ` · ${e.service.name}` : ''}`;

/** The week, small: every booked visit as a faint bar, hers lit, and the one being made dashed, so she sees where in the week they are. */
function WeekMap({ from, mine, all, start, minutes }: { from: string; mine: Entry[]; all: Entry[]; start: string; minutes: number }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const startMin = minutesOfDay(start);
  const times = [...all.map((e) => [minutesOfDay(e.appt.start), minutesOfDay(e.appt.start) + e.minutes] as const), [startMin, startMin + minutes] as const];
  const lo = Math.max(0, Math.floor((Math.min(...times.map((x) => x[0]), 9 * 60) - 30) / 60) * 60), hi = Math.min(1440, Math.ceil((Math.max(...times.map((x) => x[1]), 18 * 60) + 30) / 60) * 60);
  const pos = (a: number, b: number) => ({ top: `${((a - lo) / (hi - lo)) * 100}%`, height: `${Math.max(4, ((b - a) / (hi - lo)) * 100)}%` });
  const newDay = datePart(start);
  return (
    <div class="wk-map" data-testid="same-week-map" aria-hidden="true">
      {days.map((d, i) => (
        <div key={d} class={d === newDay ? 'wk-day new' : 'wk-day'}>
          <span>{weekdayAbbr(i)}</span>
          <div class="wk-col">
            {all.filter((e) => datePart(e.appt.start) === d).map((e) => {
              const isMine = mine.some((m) => m.appt.id === e.appt.id);
              return <i key={e.appt.id} class={isMine ? 'wk-bar mine' : 'wk-bar'} data-testid={isMine ? `same-week-mine-${e.appt.id}` : undefined} style={pos(minutesOfDay(e.appt.start), minutesOfDay(e.appt.start) + e.minutes)}>{isMine ? hhmm(minutesOfDay(e.appt.start)) : ''}</i>;
            })}
            {d === newDay && <i class="wk-bar fresh" data-testid="same-week-new" style={pos(startMin, startMin + minutes)}>{t('dup.mapNew')}</i>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The person she is booking already has a visit in that week: say so, say where (the lines and the small week), and let her go on anyway,
 * look at it in the week (the visit is lit there), throw the new one away, or change it.
 */
export function confirmSameWeek(i: { name: string; start: string; minutes: number; week: { from: string; mine: Entry[]; all: Entry[] } }, go: () => void, discard: () => void) {
  const { mine, all, from } = i.week;
  const first = [...mine].sort((a, b) => a.appt.start.localeCompare(b.appt.start))[0]!;
  const who = i.name.trim().split(/\s+/)[0] ?? '';
  ui.set({
    action: {
      title: mine.length === 1 ? t('dup.title1', { vardas: who }) : t('dup.titleN', { vardas: who, n: mine.length }),
      lines: [...mine].sort((a, b) => a.appt.start.localeCompare(b.appt.start)).map(when),
      node: <WeekMap from={from} mine={mine} all={all} start={i.start} minutes={i.minutes} />,
      items: [
        { label: t('dup.keep'), onPress: go },
        { label: t('dup.show'), onPress: () => { closeSheet(); ui.set({ tab: 'calendar', view: 'week', date: datePart(first.appt.start) }); highlight(first.appt.id); } },
        { label: t('dup.discard'), role: 'destructive', onPress: discard },
        { label: t('dup.change'), role: 'cancel', onPress: () => {} },
      ],
    },
  });
}
