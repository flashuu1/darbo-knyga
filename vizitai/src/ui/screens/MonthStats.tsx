import { repo } from '../../db/repo';
import { formatDayShort, formatEuroRound, formatEuro, weekdayName } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { buildAnalytics, delta, mean, ranking, serviceSplit, sum, type Analytics } from '../../logic/analytics';
import { BigNumber, Delta, Donut } from '../components/charts';
import { useLive } from '../hooks';
import { statsUi } from '../statsUi';
import { useStore } from '../store';
import { Card, Rank } from './ClientStats';

/**
 * The same figures as Analizė, for the month Išlaidos is showing: how many visits, new clients, the average amount,
 * days with visits, hours worked, earnings per hour (each against the month before), the best
 * days, the money by service and the clients who paid most. Money in and out is already above, so it is not repeated.
 */
export function MonthStats({ ym }: { ym: string }) {
  const a = useLive(async () => buildAnalytics(await repo.analyticsInput()), [], null as Analytics | null);
  const { top } = useStore(statsUi);
  if (!a) return null;
  const m = a.keys.indexOf(ym);
  if (m < 0) return null; // older than the 24 months the analysis keeps
  const w = { from: m, to: m };
  if (a.visits[m] === 0) return <section class="month-stats" data-testid="month-stats"><h2 class="section-head">{t('mo.head')}</h2><p class="empty-note" data-testid="month-none">{t('mo.none')}</p></section>;
  const dv = a.days.visits[m]!, dc = a.days.cents[m]!;
  const busy = Math.max(...dv), rich = Math.max(...dc);
  const wd = new Array<number>(7).fill(0);
  a.heat[m]!.forEach((row, d) => { wd[d] = sum(row); });
  const bestWd = wd.indexOf(Math.max(...wd));
  const day = (i: number) => formatDayShort(`${ym}-${String(i + 1).padStart(2, '0')}`);
  const tiles: { id: string; label: string; value: number; format: (v: number) => string; d: number | null }[] = [
    { id: 'visits', label: t('mo.visits'), value: a.visits[m]!, format: (v) => String(Math.round(v)), d: delta(a.visits, w) },
    { id: 'new', label: t('mo.new'), value: a.newClients[m]!, format: (v) => String(Math.round(v)), d: delta(a.newClients, w) },
    { id: 'avg', label: t('mo.avg'), value: a.avgCents[m]! / 100, format: (v) => formatEuroRound(v * 100), d: delta(a.avgCents, w, mean) },
    { id: 'days', label: t('mo.days'), value: a.visitDays[m]!, format: (v) => t('st.d', { n: Math.round(v) }), d: delta(a.visitDays, w) },
    { id: 'hours', label: t('mo.hours'), value: a.hours[m]!, format: (v) => t('st.hUnit', { n: Math.round(v) }), d: delta(a.hours, w) },
    { id: 'perhour', label: t('mo.perHour'), value: a.perHour[m]! / 100, format: (v) => t('st.perHourUnit', { suma: formatEuroRound(v * 100) }), d: delta(a.perHour, w, mean) },
  ];
  const split = serviceSplit(a, w).map((s) => ({ label: s.name, value: s.cents }));
  const rows = ranking(a, w, 'cents', top);
  return (
    <section class="month-stats" data-testid="month-stats">
      <h2 class="section-head">{t('mo.head')}</h2>
      <div class="mtiles">
        {tiles.map((x, i) => (
          <div key={x.id} class="mtile rise" style={{ '--i': i }} data-testid={`mtile-${x.id}`}>
            <BigNumber size="s" value={x.value} format={x.format}><Delta pct={x.d} /></BigNumber>
            <small>{x.label}</small>
          </div>
        ))}
      </div>
      <p class="hint center">{t('mo.vsPrev')}</p>
      <div class="recs rise" style={{ '--i': 6 }}>
        <div class="rec"><small>{t('mo.busyDay')}</small><b data-testid="mrec-busy">{busy > 0 ? day(dv.indexOf(busy)) : '–'}</b><span>{busy > 0 ? t('mo.visitsN', { n: busy }) : ''}</span></div>
        <div class="rec"><small>{t('mo.richDay')}</small><b data-testid="mrec-rich">{rich > 0 ? day(dc.indexOf(rich)) : '–'}</b><span>{rich > 0 ? formatEuro(rich) : ''}</span></div>
        <div class="rec"><small>{t('mo.bestWd')}</small><b data-testid="mrec-wd">{weekdayName(bestWd)}</b><span>{t('mo.visitsN', { n: wd[bestWd]! })}</span></div>
      </div>
      {split.some((s) => s.value > 0) && <Card i={7} title={t('st.byService')}><Donut items={split} fmt={(v) => formatEuroRound(v)} centerLabel={t('st.sumAll')} /></Card>}
      {rows.length > 0 && <Card i={8} title={t('st.rankSpent')}><Rank rows={rows} unit={(v) => formatEuroRound(v)} color="#34c759" detail={(r) => t('st.rkDetailMoney', { suma: formatEuro(r.spent), n: r.total })} /></Card>}
    </section>
  );
}
