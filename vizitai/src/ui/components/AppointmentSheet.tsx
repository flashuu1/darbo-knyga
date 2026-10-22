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
import { CalendarIcon, CloseIcon, NextIcon, PersonIcon, PhoneIcon, RepeatIcon, TrashIcon, WalletIcon } from '../icons';
import { statusKind, statusLabel } from '../status';
import { ui } from '../store';
import { initials } from '../screens/Clients';
import { Sheet } from './Sheet';

/** The sheet of one entry: who and when at the top, the money next, then what she can do, grouped, with the destructive ones apart. */
export function AppointmentSheet({ id }: { id: string }) {
  const appt = useLive(() => repo.getAppointment(id), [id], undefined);
  const client = useLive(async () => (appt?.clientId ? repo.getClient(appt.clientId) : undefined), [appt?.clientId], undefined);
  const all = useServices(false);
  const busy = useRef(false);
  if (!appt) return null;

  const now = nowLocal();
  const past = appt.start < now;
  const kind = statusKind(appt, now);
  const chips = all.filter((s) => s.active || s.id === appt.serviceId);
  const service = all.find((s) => s.id === appt.serviceId);
  const label = appt.kind === 'client' ? client?.name ?? '' : appt.title ?? '';
  const amount = typeof appt.amountCents === 'number' ? appt.amountCents : null;
  const expense = appt.kind === 'expense';
  const isClient = appt.kind === 'client';
  const phone = client?.phone?.trim();
  // Close the sheet first, then run the write once; a second tap cannot repeat it.
  const after = (fn: () => Promise<void>) => () => {
    if (busy.current) return;
    busy.current = true;
    closeSheet();
    fn().catch((e) => console.error(e));
  };
  const sub = [formatWhen(appt.start), service?.name, service && isClient ? t('appt.minutes', { n: service.minutes }) : undefined].filter(Boolean).join(' · ');

  return (
    <Sheet title={label} onClose={closeSheet} right={<button class="strong" data-testid="btn-close" onClick={closeSheet}>{t('btn.close')}</button>}>
      <div class="appt-hero">
        <span class={isClient ? 'avatar hero-av' : expense ? 'avatar hero-av alt' : 'avatar hero-av teal'} aria-hidden="true">{isClient ? initials(label) : expense ? <WalletIcon /> : <PersonIcon />}</span>
        <div class="hero-text">
          {isClient ? (
            <button class="link-name" data-testid="appt-name" onClick={() => ui.set({ sheet: null, client: appt.clientId })}>{label}</button>
          ) : (
            <p class="link-name" data-testid="appt-name">{label}</p>
          )}
          <p class="hero-sub" data-testid="appt-when">{sub}</p>
        </div>
        {!expense && <span class={`status-pill status-${kind}`} data-testid="appt-status">{statusLabel(appt, now)}</span>}
      </div>

      {isClient && (
        <div class="chips">
          {chips.map((s, i) => (
            <button key={s.id} data-testid={`appt-svc-${i}`} class={appt.serviceId === s.id ? 'chip on' : 'chip'} style={{ '--svc': `var(--c-${s.color})` } as CSSProperties}
              onClick={() => repo.updateAppointment(id, { serviceId: s.id }).catch((e) => console.error(e))}>{s.name}</button>
          ))}
        </div>
      )}

      {canHaveAmount(appt, now) && (
        amount === null ? (
          <button class="money-cta" data-testid="appt-amount" onClick={() => openAmount(id)}>
            <span>{t('amount.add')}</span><NextIcon />
          </button>
        ) : (
          <button class="money-done" data-testid="appt-amount" onClick={() => openAmount(id)}>
            <span class="md-check" aria-hidden="true">✓</span>
            <span class="md-sum">{formatEuro(amount)}</span>
            <span class="amount-edit">{t('amount.edit')}</span>
          </button>
        )
      )}
      {expense && (
        <button class="money-done out" data-testid="appt-amount" onClick={() => openAmount(id)}>
          <span class="md-label">{t('expense.amount')}</span>
          <span class="md-sum value out">{amount === null ? '' : `−${formatEuro(amount)}`}</span>
          <span class="amount-edit">{t('amount.edit')}</span>
        </button>
      )}

      {(appt.amountLog?.length ?? 0) > 0 && (
        <div class="amount-log" data-testid="amount-log">
          <p class="log-title">{t('amount.log.title')}</p>
          <ul>
            {[...appt.amountLog!].reverse().map((l, i) => (
              <li key={l.at} data-testid={`amount-log-${i}`}>
                <span class="log-when">{formatWhen(nowLocal(new Date(l.at)))}</span>
                <span class="log-change">{formatEuro(l.from)} → {l.to === null ? t('amount.log.cleared') : formatEuro(l.to)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="act-group">
        {appt.status === 'booked' && (
          <button class="act-row" data-testid="act-move" onClick={() => ui.set({ sheet: { type: 'move', id } })}>
            <span class="act-ico" style={{ background: 'var(--c-blue)' }}><CalendarIcon /></span><span class="act-label">{t('act.move')}</span><span class="chev"><NextIcon /></span>
          </button>
        )}
        {isClient && (
          <button class="act-row" data-testid="act-repeat" onClick={() => rebook(appt, { type: 'appt', id })}>
            <span class="act-ico" style={{ background: 'var(--c-green)' }}><RepeatIcon /></span><span class="act-label">{t('repeat.action')}</span><span class="chev"><NextIcon /></span>
          </button>
        )}
        {isClient && phone && (
          <a class="act-row" data-testid="act-call" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
            <span class="act-ico" style={{ background: 'var(--c-teal)' }}><PhoneIcon /></span><span class="act-label">{t('act.call')}</span><span class="act-value">{phone}</span><span class="chev"><NextIcon /></span>
          </a>
        )}
      </div>

      <div class="act-group danger">
        {appt.status === 'booked' && past && !expense && (
          <button class="act-row" data-testid="act-noshow" onClick={after(() => noShowWithToast(id))}>
            <span class="act-ico" style={{ background: 'var(--c-orange)' }}><CloseIcon /></span><span class="act-label">{t('act.noshow')}</span>
          </button>
        )}
        {expense && (
          <button class="act-row destructive" data-testid="act-delete-expense" onClick={after(() => deleteExpenseWithToast(id))}>
            <span class="act-ico" style={{ background: 'var(--c-red)' }}><TrashIcon /></span><span class="act-label">{t('expense.delete')}</span>
          </button>
        )}
        {appt.status === 'booked' && !expense && (
          <button class="act-row destructive" data-testid="act-cancel" onClick={() => { closeSheet(); confirmCancel(id); }}>
            <span class="act-ico" style={{ background: 'var(--c-red)' }}><CloseIcon /></span><span class="act-label">{t('act.cancelAppt')}</span>
          </button>
        )}
        {appt.status !== 'booked' && !expense && (
          <button class="act-row" data-testid="act-restore" onClick={after(() => restoreWithToast(id))}>
            <span class="act-ico" style={{ background: 'var(--c-green)' }}><RepeatIcon /></span><span class="act-label">{t('act.restore')}</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}
