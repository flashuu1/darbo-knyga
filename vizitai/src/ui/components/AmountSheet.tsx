import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import type { Appointment } from '../../db/types';
import { euroSign, formatAmountInput, formatEuro, parseAmountInput } from '../../i18n/format';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { closeSheet, openAppt, primeKeyboard, rebook, showToast } from '../actions';
import { saveAmountWithToast } from '../amount';
import { useLive } from '../hooks';
import { useKeyboardHeight } from '../keyboard';
import { Burst } from './Burst';
import { Sheet } from './Sheet';

// iOS shows a strip (arrows and a tick) above the number pad: keep the bar just above it (measured from a screenshot on the iPhone, ~24 pt)
const PASTE_BAR = 24;

/**
 * Suma: what she took for a visit, in euros. Empty + confirm clears an entered amount.
 * The first amount of a client visit is followed by a question, in the same sheet and with its button in the same
 * place (so her thumb does not travel): book this client again? Taip opens the date and time picker, Ne is done.
 */
export function AmountSheet({ id }: { id: string }) {
  const appt = useLive(() => repo.getAppointment(id), [id], undefined);
  const client = useLive(async () => (appt?.clientId ? repo.getClient(appt.clientId) : undefined), [appt?.clientId], undefined);
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ before: Appointment; cents: number } | null>(null); // set once the amount is in: shows the question
  const input = useRef<HTMLInputElement>(null);
  const kb = useKeyboardHeight();
  const busy = useRef(false);
  const suggestions = useLive(() => (appt?.clientId ? repo.amountSuggestions(appt.clientId, appt.serviceId) : []), [appt?.clientId, appt?.serviceId], [] as number[]);
  // The tap that opened the sheet focused the hidden primer, so the number keyboard is already up.
  useEffect(() => { input.current?.focus(); }, [appt !== undefined]);
  if (!appt) return null;

  const stored = typeof appt.amountCents === 'number' ? appt.amountCents : null;
  const value = text ?? (stored !== null ? formatAmountInput(stored) : '');
  const cents = parseAmountInput(value);
  const clearing = value.trim() === '' && stored !== null;
  const valid = cents !== null || clearing;
  const bad = value.trim() !== '' && cents === null;
  const name = client?.name ?? appt.title ?? '';

  const confirm = () => {
    if (!valid || busy.current) return;
    busy.current = true;
    const first = appt.kind === 'client' && stored === null && cents !== null && !clearing;
    const run = first
      ? repo.setAmount(id, cents).then(({ before }) => {
        primeKeyboard('decimal'); // the pad stays up (focus moves to the hidden field), so the question below keeps the button where it was
        setSaved({ before, cents });
      })
      : saveAmountWithToast(id, clearing ? null : cents);
    run.catch((e) => console.error(e)).finally(() => { busy.current = false; });
  };
  // Ne (or closing the sheet): the amount stays, Anuliuoti is offered
  const done = () => {
    closeSheet();
    if (saved) showToast(t('amount.saved'), () => repo.putSnapshot(saved.before));
  };
  // Taip: straight to the date and time of the next visit for the same client and service
  const again = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    rebook(appt, { type: 'appt', id });
  };
  const barStyle = { '--kb': `${kb > 0 ? kb + PASTE_BAR : 0}px` } as CSSProperties;

  if (saved) {
    return (
      <Sheet variant="dialog" title={t('amount.title')} onClose={done} testId="amount-sheet"
        left={<button data-testid="btn-dismiss" onClick={done}>{t('btn.close')}</button>}
        bar={(
          <div class="flow-bar sheet-bar bar-two" style={barStyle}>
            <button class="secondary-btn" data-testid="again-no" onClick={done}>{t('again.no')}</button>
            <button class="primary" data-testid="again-yes" onClick={again}>{t('again.yes')}</button>
          </div>
        )}>
        <div class="yay">
          <Burst />
          <span class="yay-check" aria-hidden="true">✓</span>
        </div>
        <p class="again-sum" data-testid="again-saved">{t('amount.saved')}: {formatEuro(saved.cents)}</p>
        <p class="amount-ctx" data-testid="amount-context">{name} · {formatWhen(appt.start)}</p>
        <h3 class="again-q" data-testid="again-question">{t('again.title')}</h3>
      </Sheet>
    );
  }

  return (
    <Sheet variant="dialog" title={t(appt.kind === 'expense' ? 'expense.amount' : 'amount.title')} onClose={closeSheet} testId="amount-sheet"
      left={<button data-testid="btn-dismiss" onClick={closeSheet}>{t('btn.dismiss')}</button>}
      bar={(
        <div class="flow-bar sheet-bar" style={barStyle}>
          <button class="primary" data-testid="amount-confirm" disabled={!valid} onClick={confirm}>{t('amount.confirm')}</button>
        </div>
      )}>
      <p class="amount-ctx" data-testid="amount-context">{name} · {formatWhen(appt.start)}</p>
      <label class="amount-field">
        <input ref={input} data-testid="amount-input" inputMode="decimal" enterKeyHint="done" autocomplete="off" aria-label={t('amount.field')}
          placeholder="0" value={value}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }} />
        <span class="amount-eur" aria-hidden="true">{euroSign}</span>
      </label>
      {suggestions.length > 0 && stored === null && (
        <div class="amt-chips" data-testid="amount-suggestions" aria-label={t('amount.suggest')}>
          {suggestions.map((c, i) => (
            <button key={c} class={cents === c ? 'amt-chip on' : 'amt-chip'} data-testid={`amount-suggest-${i}`} onClick={() => { setText(formatAmountInput(c)); input.current?.focus(); }}>{formatEuro(c)}</button>
          ))}
        </div>
      )}
      {bad && <p class="warn center" role="alert" data-testid="amount-invalid">{t('amount.invalid')}</p>}
      {stored !== null && !bad && <p class="hint center">{t('amount.clearHint')}</p>}
      <button class="link-btn" data-testid="amount-open-appt" onClick={() => openAppt(id)}>{t('amount.openAppt')}</button>
    </Sheet>
  );
}
