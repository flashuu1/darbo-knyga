import type { CSSProperties } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Entry } from '../../db/repo';
import { t } from '../../i18n/lt';
import { minutesOfDay, timePart } from '../../logic/time';
import { isAmountDue } from '../../logic/amount';
import { formatEuro } from '../../i18n/format';
import { openEntry } from '../amount';
import { useNow } from '../clock';
import { bindEntryDrag } from '../drag';
import { ui, useStore } from '../store';

export function EntryBlock({ e, startMin, col, cols, compact, anchor }: {
  e: Entry; startMin: number; col: number; cols: number; compact: boolean; anchor?: boolean;
}) {
  const { highlight } = useStore(ui);
  const now = useNow();
  const due = isAmountDue(e.appt, now);
  const paid = !due && e.amountCents !== null && e.appt.status === 'booked'; // confirmed: she has received it
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef(e);
  latest.current = e;
  useEffect(() => (ref.current ? bindEntryDrag(ref.current, () => latest.current) : undefined), []);
  const thin = e.appt.status === 'cancelled';
  const rows = Math.max(1, e.minutes / 15);
  const one = !compact && rows <= 1; // a 15-minute entry: one tidy line
  const style = {
    '--top': (minutesOfDay(e.appt.start) - startMin) / 15, '--len': rows, '--c': col, '--n': cols, '--svc': `var(--c-${e.color})`,
  } as CSSProperties;
  const cls = ['entry', thin ? 'thin' : one ? 'one' : 'stack', compact ? 'compact' : '', due ? 'entry--due' : paid ? 'entry--paid' : '', e.appt.status === 'noshow' ? 'noshow' : '',
    highlight === e.appt.id ? 'highlight' : '', anchor ? 'anchor' : ''].filter(Boolean).join(' ');
  const svc = e.service?.name ?? (e.appt.kind === 'personal' ? t('type.personal') : '');
  return (
    <button ref={ref} class={cls} style={style} data-testid={`entry-${e.appt.id}`} data-entry-id={e.appt.id} data-entry-box={thin ? undefined : ''}
      onClick={() => openEntry(e.appt)}>
      {one ? (
        // One line: time · name stay together (the name truncates); the service only shows when there is
        // room for a readable piece of it, otherwise it wraps onto a hidden second line (never a sliver).
        <span class="one-wrap">
          <span class="one-main"><span class="entry-time">{timePart(e.appt.start)}</span><span class="entry-dot" aria-hidden="true">·</span><span class="entry-name">{e.label}</span></span>
          {svc && <span class="one-svc"><span class="entry-dot" aria-hidden="true">·</span><span class="entry-svc">{svc}</span></span>}
        </span>
      ) : (
        <>
          <span class="entry-time">{timePart(e.appt.start)}</span>
          <span class="entry-name">{e.label}</span>
          {!compact && svc && <span class="entry-svc">{svc}</span>}
        </>
      )}
      {e.appt.status === 'noshow' && <span class="entry-flag">{t('status.noshow')}</span>}
      {due && <span class="entry-amount" data-testid={`due-${e.appt.id}`}>{t('amount.add')}</span>}
      {paid && <span class="entry-amount paid" data-testid={`amount-${e.appt.id}`}>✓ {formatEuro(e.amountCents!)}</span>}
    </button>
  );
}
