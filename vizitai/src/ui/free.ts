import { useMemo } from 'preact/hooks';
import { repo, type Entry } from '../db/repo';
import { addDays } from '../logic/time';
import { busyFrom, freeGaps, rankSlots, slotsFor, type FreeSlot, type RecMode } from '../logic/freetime';
import { useNow } from './clock';
import { freeUi } from './freeUi';
import { useLive, useSettings } from './hooks';
import { useStore } from './store';

export const REC_MINUTES = 60;
export interface FreeWeek { slots: FreeSlot[]; ranked: FreeSlot[]; best: FreeSlot | null; minutes: number; mode: RecMode; ri: number }

/** The free slots of the week on screen: where a visit of the set length fits inside the recommended window, best first. */
export function useFreeWeek(days: string[], on: boolean): FreeWeek | null {
  const s = useSettings();
  const now = useNow();
  const { ri } = useStore(freeUi);
  const first = days[0]!;
  const entries = useLive(() => (on ? repo.entriesBetween(first, addDays(days[6]!, 1)) : Promise.resolve([] as Entry[])), [on, first], [] as Entry[]);
  const minutes = s.recMinutes ?? REC_MINUTES, mode = s.recMode ?? 'free';
  return useMemo(() => {
    if (!on) return null;
    const gaps = freeGaps(days, busyFrom(entries), s, now);
    const slots = slotsFor(gaps, minutes, days, s);
    const ranked = rankSlots(slots, mode);
    const shown = Math.min(3, ranked.length);
    return { slots, ranked, best: ranked[shown ? ri % shown : 0] ?? null, minutes, mode, ri: shown ? ri % shown : 0 };
  }, [on, first, entries, s.dayStart, s.dayEnd, s.workDays, s.recFrom, s.recTo, minutes, mode, now, ri]);
}
