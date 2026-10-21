import type { CSSProperties } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatDayShort, formatEuro, monthName } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { timePart, todayStr } from '../../logic/time';
import { openAppt } from '../actions';
import { useLive } from '../hooks';
import { ui } from '../store';
import { initials } from './Clients';

type Day = { date: string; inCents: number; outCents: number; paid: number };

const shiftMonth = (ym: string, dir: -1 | 1) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * The month at a glance: money in above the line (green), money out below it (calm indigo, never alarm red), one
 * column per day. Drag a finger across it to read any day. Colour is never the only cue: in is above, out is below,
 * and both carry their amounts in the legend and the readout.
 */
function FlowChart({ days, sel, onSel }: { days: Day[]; sel: number | null; onSel: (i: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...days.flatMap((d) => [d.inCents, d.outCents]));
  const h = (c: number) => (c > 0 ? `max(3px, ${(c / max) * 100}%)` : '0');
  const at = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return Math.min(days.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * days.length)));
  };
  return (
    <div class="flow-chart" data-testid="flow-chart">
      <div class="fc-plot" ref={box} style={{ '--days': days.length } as CSSProperties} role="img" aria-label={t('expenses.chart')}
        onPointerDown={(e) => { const i = at(e); onSel(i === sel ? null : i); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') onSel(at(e)); }}>
        {days.map((d, i) => (
          <div key={d.date} class={sel === i ? 'fc-col on' : 'fc-col'} data-testid={`fc-day-${i + 1}`}>
            <div class="fc-up">{d.inCents > 0 && <i style={{ height: h(d.inCents) }} />}</div>
            <div class="fc-down">{d.outCents > 0 && <i style={{ height: h(d.outCents) }} />}</div>
          </div>
        ))}
      </div>
      <div class="fc-axis" aria-hidden="true">
        {days.map((d, i) => (i % 7 === 0 ? <span key={d.date} style={{ left: `${(i / days.length) * 100}%` }}>{i + 1}</span> : null))}
      </div>
    </div>
  );
}

/** Išlaidos: the month's money, month by month. What came in leads; what went out is calm and secondary. */
export function ExpensesScreen() {
  const [ym, setYm] = useState(todayStr().slice(0, 7));
  const [sel, setSel] = useState<number | null>(null);
  const o = useLive(() => repo.monthOverview(ym), [ym], { entries: [], inCents: 0, outCents: 0, byKind: [], days: [], payers: [] });
  const day = `${ym}-15`;
  const net = o.inCents - o.outCents;
  const maxKind = Math.max(1, ...o.byKind.map((k) => k.cents));
  const go = (dir: -1 | 1) => { setSel(null); setYm(shiftMonth(ym, dir)); };
  const picked = sel !== null ? o.days[sel] : undefined;
  return (
    <section class="list-screen" data-testid="expenses">
      <header class="chrome">
        <h1 class="large-title top">{t('tab.expenses')}</h1>
        <div class="month-nav">
          <button class="picker-nav" data-testid="exp-prev" aria-label={t('picker.prev')} onClick={() => go(-1)}>‹</button>
          <span data-testid="exp-month">{monthName(day)} {ym.slice(0, 4)}</span>
          <button class="picker-nav" data-testid="exp-next" aria-label={t('picker.next')} onClick={() => go(1)}>›</button>
        </div>
      </header>
      <div class="scroll list-body">
        <div class="money-hero">
          <p class="hero-label">{t('expenses.left')}</p>
          <p class={net < 0 ? 'hero-num neg' : net > 0 ? 'hero-num pos' : 'hero-num'} data-testid="exp-net">{formatEuro(net)}</p>
          <div class="hero-legend">
            <span class="lg in"><i aria-hidden="true" />{t('balance.in')} <b data-testid="exp-in">{formatEuro(o.inCents)}</b></span>
            <span class="lg out"><i aria-hidden="true" />{t('balance.out')} <b data-testid="exp-out">−{formatEuro(o.outCents)}</b></span>
          </div>
        </div>

        {o.days.length > 0 && (o.inCents > 0 || o.outCents > 0) && (
          <div class="group chart-card">
            <p class="chart-readout" data-testid="fc-readout">
              {picked
                ? <>{formatDayShort(picked.date)} · <span class="in">+{formatEuro(picked.inCents)}</span> · <span class="out">−{formatEuro(picked.outCents)}</span>{picked.paid > 0 ? ` · ${t('expenses.paidCount', { n: picked.paid })}` : ''}</>
                : t('expenses.chart')}
            </p>
            <FlowChart days={o.days} sel={sel} onSel={setSel} />
          </div>
        )}

        {o.payers.length > 0 && (
          <>
            <h2 class="section-head">{t('expenses.paidBy')}</h2>
            <ul class="payers" data-testid="exp-payers">
              {o.payers.map((p, i) => (
                <li key={p.clientId}>
                  <button class="payer" data-testid={`exp-payer-${i}`} onClick={() => ui.set({ client: p.clientId })}>
                    <span class="payer-dot" aria-hidden="true">{initials(p.name)}</span>
                    <span class="payer-amt">{formatEuro(p.cents)}</span>
                    <span class="payer-name">{p.name.split(' ')[0]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {o.entries.length === 0 && <p class="empty-note" data-testid="exp-empty">{t('expenses.empty')}</p>}
        {o.byKind.length > 0 && (
          <>
            <h2 class="section-head">{t('expenses.byKind')}</h2>
            <ul class="group">
              {o.byKind.map((k, i) => (
                <li key={k.name} class="kind-row" data-testid={`exp-kind-${i}`}>
                  <div class="kind-top"><span>{k.name}</span><b>−{formatEuro(k.cents)}</b></div>
                  <div class="kind-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, (k.cents / maxKind) * 100)}%` }} /></div>
                </li>
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
                    <b class="amt-out">−{formatEuro(e.amountCents ?? 0)}</b>
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
