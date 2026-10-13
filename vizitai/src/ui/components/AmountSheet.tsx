import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { euroSign, formatAmountInput, parseAmountInput } from '../../i18n/format';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { closeSheet, openAppt } from '../actions';
import { saveAmountWithToast } from '../amount';
import { useLive } from '../hooks';
import { useKeyboardHeight } from '../keyboard';
import { Sheet } from './Sheet';

// iOS puts a Paste / autofill strip above the number pad that the viewport height does not include: stay clear of it
const PASTE_BAR = 52;

/** Suma: what she took for a visit, in euros. Empty + confirm clears an entered amount. */
export function AmountSheet({ id }: { id: string }) {
  const appt = useLive(() => repo.getAppointment(id), [id], undefined);
  const client = useLive(async () => (appt?.clientId ? repo.getClient(appt.clientId) : undefined), [appt?.clientId], undefined);
  const [text, setText] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const kb = useKeyboardHeight();
  const busy = useRef(false);
  // The tap that opened the sheet focused the hidden primer, so the number keyboard is already up.
  useEffect(() => { input.current?.focus(); }, [appt !== undefined]);
  if (!appt) return null;

  const stored = typeof appt.amountCents === 'number' ? appt.amountCents : null;
  const value = text ?? (stored !== null ? formatAmountInput(stored) : '');
  const cents = parseAmountInput(value);
  const clearing = value.trim() === '' && stored !== null;
  const valid = cents !== null || clearing;
  const bad = value.trim() !== '' && cents === null;

  const confirm = () => {
    if (!valid || busy.current) return;
    busy.current = true;
    saveAmountWithToast(id, clearing ? null : cents).catch((e) => console.error(e)).finally(() => { busy.current = false; });
  };

  return (
    <Sheet variant="dialog" title={t(appt.kind === 'expense' ? 'expense.amount' : 'amount.title')} onClose={closeSheet} testId="amount-sheet"
      left={<button data-testid="btn-dismiss" onClick={closeSheet}>{t('btn.dismiss')}</button>}
      bar={(
        <div class="flow-bar sheet-bar" style={{ '--kb': `${kb > 0 ? kb + PASTE_BAR : 0}px` } as CSSProperties}>
          <button class="primary" data-testid="amount-confirm" disabled={!valid} onClick={confirm}>{t('amount.confirm')}</button>
        </div>
      )}>
      <p class="amount-ctx" data-testid="amount-context">{client?.name ?? appt.title ?? ''} · {formatWhen(appt.start)}</p>
      <label class="amount-field">
        <input ref={input} data-testid="amount-input" inputMode="decimal" enterKeyHint="done" autocomplete="off" aria-label={t('amount.field')}
          placeholder="0" value={value}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }} />
        <span class="amount-eur" aria-hidden="true">{euroSign}</span>
      </label>
      {bad && <p class="warn center" role="alert" data-testid="amount-invalid">{t('amount.invalid')}</p>}
      {stored !== null && !bad && <p class="hint center">{t('amount.clearHint')}</p>}
      <button class="link-btn" data-testid="amount-open-appt" onClick={() => openAppt(id)}>{t('amount.openAppt')}</button>
    </Sheet>
  );
}
