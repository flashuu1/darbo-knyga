import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { nowLocal, snap } from '../../logic/time';
import { closeSheet, confirmCancel, moveWithToast, noShowWithToast, repeatFrom, restoreWithToast } from '../actions';
import { useLive, useServices } from '../hooks';
import { statusLabel } from '../status';
import { ui } from '../store';
import { Sheet } from './Sheet';

export function AppointmentSheet({ id }: { id: string }) {
  const appt = useLive(() => repo.getAppointment(id), [id], undefined);
  const client = useLive(async () => (appt?.clientId ? repo.getClient(appt.clientId) : undefined), [appt?.clientId], undefined);
  const all = useServices(false);
  const busy = useRef(false);
  // Perkelti: the iOS picker fires `change` as soon as a day is tapped, so a picked value only waits here;
  // it is saved when the picker closes (blur) or when the sheet closes by any other way (unmount).
  const pending = useRef<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null); // raw picker value, so a re-render never resets the wheels
  useEffect(() => () => {
    const v = pending.current;
    pending.current = null;
    if (!v || busy.current) return; // another action already ran
    busy.current = true;
    moveWithToast(id, v).catch((e) => console.error(e));
  }, []);
  if (!appt) return null;

  const past = appt.start < nowLocal();
  const status = statusLabel(appt);
  const chips = all.filter((s) => s.active || s.id === appt.serviceId);
  const label = appt.kind === 'personal' ? appt.title ?? '' : client?.name ?? '';
  // Close the sheet first, then run the write once; a second tap or change event cannot repeat it.
  const after = (fn: () => Promise<void>) => () => {
    if (busy.current) return;
    busy.current = true;
    closeSheet();
    fn().catch((e) => console.error(e));
  };

  return (
    <Sheet title={label} onClose={closeSheet} right={<button class="strong" data-testid="btn-close" onClick={closeSheet}>{t('btn.close')}</button>}>
      {appt.kind === 'client' ? (
        <button class="link-name" data-testid="appt-name" onClick={() => ui.set({ sheet: null, client: appt.clientId })}>{label}</button>
      ) : (
        <p class="link-name" data-testid="appt-name">{label}</p>
      )}
      {appt.kind === 'client' && (
        <div class="chips">
          {chips.map((s, i) => (
            <button key={s.id} data-testid={`appt-svc-${i}`} class={appt.serviceId === s.id ? 'chip on' : 'chip'} style={{ '--svc': `var(--c-${s.color})` } as CSSProperties}
              onClick={() => repo.updateAppointment(id, { serviceId: s.id }).catch((e) => console.error(e))}>{s.name}</button>
          ))}
        </div>
      )}
      <div class="row"><span class="value">{formatWhen(appt.start)}</span></div>
      <div class="row"><span class="label">{t('appt.status')}</span><span class="value" data-testid="appt-status">{status}</span></div>
      <div class="actions-list">
        {appt.status === 'booked' && (
          <label class="action-row move-row" data-testid="act-move">
            <span>{t('act.move')}</span>
            {/* Transparent native picker laid over the row (same pattern as the New sheet's time row). */}
            <input type="datetime-local" step={900} value={picked ?? appt.start} data-testid="move-input"
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                setPicked(v || null);
                const s = v ? snap(v) : null;
                pending.current = s && s !== appt.start ? s : null;
              }}
              onBlur={() => { if (pending.current) closeSheet(); }} />
          </label>
        )}
        {appt.status === 'booked' && past && <button class="action-row" data-testid="act-noshow" onClick={after(() => noShowWithToast(id))}>{t('act.noshow')}</button>}
        {appt.kind === 'client' && <button class="action-row" data-testid="act-repeat" onClick={() => { closeSheet(); repeatFrom(appt); }}>{t('repeat.action')}</button>}
        {appt.status === 'booked' && <button class="action-row destructive" data-testid="act-cancel" onClick={() => { closeSheet(); confirmCancel(id); }}>{t('act.cancelAppt')}</button>}
        {appt.status !== 'booked' && <button class="action-row" data-testid="act-restore" onClick={after(() => restoreWithToast(id))}>{t('act.restore')}</button>}
      </div>
    </Sheet>
  );
}
