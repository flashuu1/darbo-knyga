import { useEffect, useRef, useState } from 'preact/hooks';
import { repo, type Entry } from '../../db/repo';
import { formatDayLong, formatDayShort, formatEuro, monthName } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, scopeRange, timePart, type Scope } from '../../logic/time';
import { closeSheet, rebook, showToast } from '../actions';
import { openAmount } from '../amount';
import { useLive } from '../hooks';
import { initials } from '../screens/Clients';
import { Burst } from './Burst';
import { Sheet } from './Sheet';

const lastWaiting = new Map<string, number>();
const EMPTY = { scope: '' as Scope | '', date: '', due: [] as Entry[], older: [] as Entry[], paid: [] as Entry[], upcoming: 0, inCents: 0, outCents: 0, suggest: {} as Record<string, number[]> };
const PAID_SHOWN = 30; // a month can have a hundred paid visits: the newest are listed, the rest only counted

/** What the page is about: "spalio 14 d., trečiadienis", "spalio 12 – 18", "spalis 2026". */
function rangeLabel(scope: Scope, date: string) {
  if (scope === 'day') return formatDayLong(date);
  if (scope === 'month') return `${monthName(date)} ${date.slice(0, 4)}`;
  const { from, to } = scopeRange('week', date);
  return `${formatDayShort(from)} – ${formatDayShort(addDays(to, -1))}`;
}

/**
 * Dienos / Savaitės / Mėnesio suvestinė: the books of what is on screen. What still waits for its amount, each with the
 * amounts this client paid before as one-tap chips; what is already in; the money. When the last one is entered the
 * period is "closed" with a small celebration.
 */
export function SummarySheet({ scope, date }: { scope: Scope; date: string }) {
  const s = useLive(() => repo.summary(scope, date), [scope, date], EMPTY);
  const loaded = s.scope === scope && s.date === date;
  const waiting = s.due.length + s.older.length;
  const [celebrate, setCelebrate] = useState(false);
  const busy = useRef(new Set<string>());
  const key = `${scope}${date}`;
  // The last waiting visit was just settled: a moment of celebration. (The page is closed while Suma is open, so what
  // was waiting last time is remembered outside it.)
  useEffect(() => {
    if (!loaded) return;
    if ((lastWaiting.get(key) ?? 0) > 0 && waiting === 0) setCelebrate(true);
    lastWaiting.set(key, waiting);
  }, [loaded, waiting, key]);

  async function pay(e: Entry, cents: number) {
    if (busy.current.has(e.appt.id)) return;
    busy.current.add(e.appt.id);
    try {
      const { before } = await repo.setAmount(e.appt.id, cents);
      showToast(t('amount.saved'), () => repo.putSnapshot(before));
    } catch (err) {
      console.error(err);
    } finally {
      busy.current.delete(e.appt.id);
    }
  }
  const other = (e: Entry) => openAmount(e.appt.id, { type: 'summary', scope, date });

  const when = (e: Entry, withDay: boolean) => `${withDay ? `${formatDayShort(e.appt.start.slice(0, 10))} · ` : ''}${timePart(e.appt.start)}${e.service?.name ? ` · ${e.service.name}` : ''}`;
  const row = (e: Entry, i: number, prefix: string, withDay: boolean) => (
    <li key={e.appt.id} class="eod-row" data-testid={`${prefix}-${i}`}>
      <div class="eod-top">
        <span class="avatar" aria-hidden="true">{initials(e.label)}</span>
        <div class="eod-text"><b>{e.label}</b><span>{when(e, withDay)}</span></div>
      </div>
      <div class="eod-chips">
        {(s.suggest[e.appt.id] ?? []).map((c, j) => (
          <button key={c} class="amt-chip" data-testid={`${prefix}-chip-${i}-${j}`} onClick={() => void pay(e, c)}>{formatEuro(c)}</button>
        ))}
        <button class="amt-chip other" data-testid={`${prefix}-other-${i}`} onClick={() => other(e)}>{t('eod.other')}</button>
      </div>
    </li>
  );

  const net = s.inCents - s.outCents;
  const total = s.paid.length + waiting;
  const many = scope !== 'day';
  const paidShown = many ? [...s.paid].reverse().slice(0, PAID_SHOWN) : s.paid;
  return (
    <Sheet title={t(`eod.title.${scope}`)} onClose={closeSheet} testId="day-sheet"
      right={<button class="strong" data-testid="btn-close" onClick={closeSheet}>{t('btn.close')}</button>}>
      <div class="money-hero eod-hero">
        {celebrate && <div class="yay"><Burst /></div>}
        <p class="hero-label" data-testid="eod-date">{rangeLabel(scope, date)}</p>
        <p class={net > 0 ? 'hero-num pos' : net < 0 ? 'hero-num neg' : 'hero-num'} data-testid="eod-net">{formatEuro(net)}</p>
        <div class="hero-legend">
          <span class="lg in"><i aria-hidden="true" />{t('balance.in')} <b data-testid="eod-in">{formatEuro(s.inCents)}</b></span>
          <span class="lg out"><i aria-hidden="true" />{t('balance.out')} <b data-testid="eod-out">−{formatEuro(s.outCents)}</b></span>
        </div>
        {total > 0 && (
          <div class="eod-progress" data-testid="eod-progress">
            <div class="eod-bar" aria-hidden="true"><i style={{ width: `${(s.paid.length / total) * 100}%` }} /></div>
            <p>{waiting === 0 ? <span class="eod-done" data-testid="eod-done">{t('eod.alldone')}</span> : t('eod.progress', { a: s.paid.length, b: total })}</p>
          </div>
        )}
      </div>

      {s.due.length > 0 && (<><h2 class="section-head">{t('eod.waiting')}</h2><ul class="group eod-list">{s.due.map((e, i) => row(e, i, 'eod-row', many))}</ul></>)}
      {s.older.length > 0 && (<><h2 class="section-head">{t('eod.older')}</h2><ul class="group eod-list">{s.older.map((e, i) => row(e, i, 'eod-older', true))}</ul></>)}

      {paidShown.length > 0 && (
        <>
          <h2 class="section-head">{t('eod.paid')}</h2>
          <ul class="group eod-list">
            {paidShown.map((e, i) => (
              <li key={e.appt.id} class="eod-row paid" data-testid={`eod-paid-${i}`}>
                <div class="eod-top">
                  <span class="avatar paid-av" aria-hidden="true">✓</span>
                  <div class="eod-text"><b>{e.label}</b><span>{when(e, many)}</span></div>
                  <b class="eod-amt">{formatEuro(e.amountCents ?? 0)}</b>
                </div>
                <div class="eod-chips"><button class="amt-chip" data-testid={`eod-again-${i}`} onClick={() => rebook(e.appt, { type: 'appt', id: e.appt.id })}>{t('eod.again')}</button></div>
              </li>
            ))}
          </ul>
          {s.paid.length > paidShown.length && <p class="section-foot center" data-testid="eod-more">{t('eod.more', { n: s.paid.length - paidShown.length })}</p>}
        </>
      )}
      {s.upcoming > 0 && <p class="section-foot center" data-testid="eod-upcoming">{t('eod.upcoming', { n: s.upcoming })}</p>}
      {total === 0 && s.upcoming === 0 && loaded && <p class="empty-note" data-testid="eod-empty">{t('eod.empty')}</p>}
    </Sheet>
  );
}
