import { formatMinutes } from './EditList';
import { weekdayName } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { hhmm } from '../../logic/time';
import { weekdayOf, type FreeSlot } from '../../logic/freetime';
import { freeUi } from '../freeUi';
import type { FreeWeek } from '../free';
import { NextIcon } from '../icons';

/** "Savaitė, ketvirtadienis 15:00". */
export const whenOf = (c: FreeSlot) => `${weekdayName(weekdayOf(c.date)).toLowerCase()} ${hhmm(c.start)}`;

/**
 * Under the title of the week: the best time for a new visit this week (and, with a tap, the second and the third). Another week shows
 * the best time of that week. When nothing fits this week, it takes her to the next one.
 */
export function FreePill({ free, onNextWeek }: { free: FreeWeek; onNextWeek: () => void }) {
  const { best, ranked, ri, minutes } = free;
  if (!best) {
    return (
      <button class="freepill none" data-testid="free-rec" onClick={onNextWeek}>
        <span class="fp-star" aria-hidden="true">–</span>
        <span class="fp-text"><b data-testid="free-rec-title">{t('free.none')}</b><span data-testid="free-rec-sub">{t('free.noneSub', { trukme: formatMinutes(minutes) })}</span></span>
        <span class="fp-go">{t('free.nextWeek')}</span>
      </button>
    );
  }
  const shown = Math.min(3, ranked.length);
  const cycle = () => freeUi.set({ ri: (ri + 1) % shown, tick: freeUi.get().tick + 1 });
  return (
    <button class="freepill" data-testid="free-rec" onClick={cycle}>
      <span class="fp-star" aria-hidden="true">★</span>
      <span class="fp-text">
        <b data-testid="free-rec-title">{ri === 0 ? t('free.best', { kada: whenOf(best) }) : t('free.rank', { n: ri + 1, kada: whenOf(best) })}</b>
        <span data-testid="free-rec-sub">{t('free.reason', { trukme: formatMinutes(best.gap.end - best.gap.start), proc: Math.round(best.dayFrac * 100) })}</span>
      </span>
      <span class="fp-go">{shown > 1 ? t('free.next') : t('free.show')}{shown > 1 && <NextIcon />}</span>
    </button>
  );
}
