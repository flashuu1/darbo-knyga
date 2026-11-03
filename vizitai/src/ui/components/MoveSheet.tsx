import { useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { closeSheet, confirmOverlap, moveWithToast } from '../actions';
import { useLive } from '../hooks';
import { DateTimePicker } from './DateTimePicker';
import { Sheet } from './Sheet';

/** Perkelti: pick a new day and time in the calendar, confirm; nothing moves until she confirms. */
export function MoveSheet({ id }: { id: string }) {
  const appt = useLive(() => repo.getAppointment(id), [id], undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const busy = useRef(false);
  if (!appt) return null;
  const value = picked ?? appt.start;
  const changed = value !== appt.start;
  const go = () => {
    busy.current = true;
    closeSheet();
    moveWithToast(id, value).catch((e) => console.error(e));
  };
  // Something already at the new time: say what, and ask first
  const confirm = () => {
    if (!changed || busy.current) return;
    void repo.overlapsOfMove(id, value).then((hits) => { if (hits.length) confirmOverlap(hits, go, 'overlap.keepMove'); else go(); }).catch((e) => console.error(e));
  };
  return (
    <Sheet title={t('act.move')} onClose={closeSheet} testId="move-sheet"
      left={<button data-testid="btn-dismiss" onClick={closeSheet}>{t('btn.dismiss')}</button>}
      right={<button class="strong" data-testid="btn-move-confirm" disabled={!changed} onClick={confirm}>{t('act.move')}</button>}>
      <p class="move-from" data-testid="move-from">{formatWhen(appt.start)}</p>
      <DateTimePicker value={value} onChange={setPicked} />
    </Sheet>
  );
}
