import { useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatDayShort, formatEuro, monthName } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { timePart, todayStr } from '../../logic/time';
import { openAppt } from '../actions';
import { useLive } from '../hooks';

const shiftMonth = (ym: string, dir: -1 | 1) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Išlaidos: every expense she entered, month by month, with what came in and the balance of that month. */
export function ExpensesScreen() {
  const [ym, setYm] = useState(todayStr().slice(0, 7));
  const o = useLive(() => repo.monthOverview(ym), [ym], { entries: [], inCents: 0, outCents: 0, byKind: [] });
  const day = `${ym}-15`;
  const net = o.inCents - o.outCents;
  return (
    <section class="list-screen" data-testid="expenses">
      <header class="chrome">
        <h1 class="large-title top">{t('tab.expenses')}</h1>
        <div class="month-nav">
          <button class="picker-nav" data-testid="exp-prev" aria-label={t('picker.prev')} onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
          <span data-testid="exp-month">{monthName(day)} {ym.slice(0, 4)}</span>
          <button class="picker-nav" data-testid="exp-next" aria-label={t('picker.next')} onClick={() => setYm(shiftMonth(ym, 1))}>›</button>
        </div>
      </header>
      <div class="scroll list-body">
        <div class="group sum-group">
          <p class="group-row sum-row"><span>{t('balance.in')}</span><b data-testid="exp-in">{formatEuro(o.inCents)}</b></p>
          <p class="group-row sum-row"><span>{t('balance.out')}</span><b class="out" data-testid="exp-out">−{formatEuro(o.outCents)}</b></p>
          <p class="group-row sum-row"><span>{t('balance.label')}</span><b class={net < 0 ? 'neg' : 'pos'} data-testid="exp-net">{formatEuro(net)}</b></p>
        </div>
        {o.entries.length === 0 && <p class="empty-note" data-testid="exp-empty">{t('expenses.empty')}</p>}
        {o.byKind.length > 0 && (
          <>
            <h2 class="section-head">{t('expenses.byKind')}</h2>
            <ul class="group">
              {o.byKind.map((k, i) => (
                <li key={k.name} class="group-row sum-row" data-testid={`exp-kind-${i}`}><span>{k.name}</span><b class="out">−{formatEuro(k.cents)}</b></li>
              ))}
            </ul>
          </>
        )}
        {o.entries.length > 0 && (
          <>
            <h2 class="section-head">{t('expenses.entries')}</h2>
            <ul class="group">
              {o.entries.map((e, i) => (
                <li key={e.appt.id}>
                  <button class="client-row" data-testid={`exp-row-${i}`} onClick={() => openAppt(e.appt.id)}>
                    <span class="client-text"><b>{e.label}</b><span>{formatDayShort(e.appt.start.slice(0, 10))} · {timePart(e.appt.start)}</span></span>
                    <b class="out">−{formatEuro(e.amountCents ?? 0)}</b>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
