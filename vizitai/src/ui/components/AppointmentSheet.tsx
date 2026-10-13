import type { CSSProperties } from 'preact';
import { useRef } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatEuro, formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { canHaveAmount } from '../../logic/amount';
import { nowLocal } from '../../logic/time';
import { closeSheet, confirmCancel, deleteExpenseWithToast, noShowWithToast, rebook, restoreWithToast } from '../actions';
import { openAmount } from '../amount';
import { useLive, useServices } from '../hooks';
import { statusKind, statusLabel } from '../status';
import { ui } from '../store';
import { Sheet } from './Sheet';

export function AppointmentSheet({ id }: { id: string }) {
  const appt = useLive(() => repo.getAppointment(id), [id], undefined);
  const client = useLive(async () => (appt?.clientId ? repo.getClient(appt.clientId) : undefined), [appt?.clientId], undefined);
  const all = useServices(false);
  const busy = useRef(false);
  if (!appt) return null;

  const now = nowLocal();
  const past = appt.start < now;
  const status = statusLabel(appt);
  const chips = all.filter((s) => s.active || s.id === appt.serviceId);
  const label = appt.kind === 'client' ? client?.name ?? '' : appt.title ?? '';
  const expense = appt.kind === 'expense';
  const amount = typeof appt.amountCents === 'number' ? appt.amountCents : null;
  // Close the sheet first, then run the write once; a second tap cannot repeat it.
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
      {!expense && <div class="row"><span class="label">{t('appt.status')}</span><span class={`value status-${statusKind(appt, now)}`} data-testid="appt-status">{status}</span></div>}
      {expense && (
        <button class="row amount-row" data-testid="appt-amount" onClick={() => openAmount(id)}>
          <span class="label">{t('expense.amount')}</span>
          <span class="value out">{amount === null ? '' : `−${formatEuro(amount)}`}</span>
          <span class="amount-edit">{t('amount.edit')}</span>
        </button>
      )}
      {canHaveAmount(appt, now) && (
        <button class={amount === null ? 'row amount-row due' : 'row amount-row'} data-testid="appt-amount" onClick={() => openAmount(id)}>
          <span class="label">{t('amount.title')}</span>
          <span class="value">{amount === null ? t('amount.add') : formatEuro(amount)}</span>
          {amount !== null && <span class="amount-edit">{t('amount.edit')}</span>}
        </button>
      )}
      <div class="actions-list">
        {appt.status === 'booked' && (
          <button class="action-row" data-testid="act-move" onClick={() => ui.set({ sheet: { type: 'move', id } })}>{t('act.move')}</button>
        )}
        {appt.status === 'booked' && past && !expense && <button class="action-row" data-testid="act-noshow" onClick={after(() => noShowWithToast(id))}>{t('act.noshow')}</button>}
        {appt.kind === 'client' && <button class="action-row" data-testid="act-repeat" onClick={() => rebook(appt, { type: 'appt', id })}>{t('repeat.action')}</button>}
        {expense && <button class="action-row destructive" data-testid="act-delete-expense" onClick={after(() => deleteExpenseWithToast(id))}>{t('expense.delete')}</button>}
        {appt.status === 'booked' && !expense && <button class="action-row destructive" data-testid="act-cancel" onClick={() => { closeSheet(); confirmCancel(id); }}>{t('act.cancelAppt')}</button>}
        {appt.status !== 'booked' && !expense && <button class="action-row" data-testid="act-restore" onClick={after(() => restoreWithToast(id))}>{t('act.restore')}</button>}
      </div>
    </Sheet>
  );
}
