import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { repo } from '../../db/repo';
import { formatDayShort, formatEuro, formatEuroRound, monthAbbr, monthYear, weekdayAbbr, weekdayName } from '../../i18n/format';
import { t } from '../../i18n/lt';
import {
  buildAnalytics, delta, heatOf, mean, MONTHS, presetWin, ranking, records, retention, serviceSplit, slice, sum, winLen,
  type Analytics, type RankRow, type Win,
} from '../../logic/analytics';
import { BigNumber, Delta, Donut, HeatMap, LineChart, PeriodBar, type LineCfg } from '../components/charts';
import { Segmented } from '../components/Segmented';
import { useLive } from '../hooks';
import { goPage, slideClass, STAT_TABS, statsUi, type StatTab } from '../statsUi';
import { ui, useStore } from '../store';

const num = new Intl.NumberFormat('lt-LT', { maximumFractionDigits: 1 });
const whole = (v: number) => String(Math.round(v));
const gapText = (days: number) => (days < 14 ? t('st.d', { n: Math.round(days) }) : t('st.w', { n: num.format(days / 7) }));

export function Card({ i, title, children, testId }: { i: number; title: string; children: ComponentChildren; testId?: string }) {
  return <section class="card rise" style={{ '--i': Math.min(i, 7) }} data-testid={testId}><h5>{title}</h5>{children}</section>;
}
function Spark({ vals, color }: { vals: number[]; color: string }) {
  const mx = Math.max(...vals, 1), n = vals.length;
  if (n < 2) return <svg class="spark" viewBox="0 0 64 20" />;
  return <svg class="spark" viewBox="0 0 64 20" aria-hidden="true"><polyline points={vals.map((v, i) => `${(i / (n - 1) * 64).toFixed(1)},${(18 - v / mx * 16).toFixed(1)}`).join(' ')} fill="none" stroke={color} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}
/** A ranked list; tapping a row opens a line with its details. */
export function Rank({ rows, unit, detail, color }: { rows: RankRow[]; unit: (v: number) => string; detail: (r: RankRow) => string; color: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const top = statsUi.get().top;
  return (
    <>
      <div class="rank" data-testid="rank">
        {rows.map((r, i) => (
          <button key={r.id} class={open === r.id ? 'rk on' : 'rk'} data-testid={`rank-${i}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span class="top"><b>{i + 1}. {r.name}</b><Spark vals={r.trend} color={color} /><span>{unit(r.value)}</span></span>
            {open === r.id && <span class="more">{detail(r)}</span>}
          </button>
        ))}
      </div>
      <div class="chips">
        {([5, 10, 20] as const).map((n) => <button key={n} class={top === n ? 'on' : ''} data-testid={`top-${n}`} onClick={() => statsUi.set({ top: n })}>{t('st.top', { n })}</button>)}
      </div>
    </>
  );
}

export function ClientStats() {
  const { stat, win, top, dir } = useStore(statsUi);
  const shown = useRef(false); // the first page comes in with the whole screen; later pages slide by themselves
  useEffect(() => { shown.current = true; }, []);
  const a = useLive(async () => buildAnalytics(await repo.analyticsInput()), [], null as Analytics | null);
  const labels = useMemo(() => (a ? a.keys.slice(win.from, win.to + 1).map(monthAbbr) : []), [a, win.from, win.to]);
  const tipL = (i: number) => (a ? monthYear(a.keys[win.from + i]!) : '');
  const empty = !a || !a.hasData;
  return (
    <>
      <div class="scroll list-body stats-body" data-testid="stats">
        <Segmented small testId="stat-seg" value={stat} onChange={(v: StatTab) => goPage(1 + STAT_TABS.indexOf(v))}
          items={[{ id: 'new', label: t('st.new') }, { id: 'freq', label: t('st.freq') }, { id: 'profit', label: t('st.profit') }, { id: 'time', label: t('st.time') }]} />
        {empty ? <p class="empty-note" data-testid="stats-empty">{t('st.empty')}</p> : (
          <>
            <section class="card rise" style={{ '--i': 0 }}>
              <div class="winhead"><h5>{t('st.period')}</h5><b data-testid="win-text">{monthYear(a.keys[win.from]!)} – {monthYear(a.keys[win.to]!)}</b></div>
              <PeriodBar bars={a.visits} win={win} label={t('st.period')} onChange={(w) => statsUi.set({ win: w })} />
              <p class="hint">{t('st.deltaHint')}</p>
            </section>
            <div class={`stat-pane ${shown.current ? slideClass(dir) : ''}`} key={stat}>
              {stat === 'new' && <NewTab a={a} win={win} labels={labels} tipL={tipL} />}
              {stat === 'freq' && <FreqTab a={a} win={win} labels={labels} tipL={tipL} top={top} />}
              {stat === 'profit' && <ProfitTab a={a} win={win} labels={labels} tipL={tipL} top={top} />}
              {stat === 'time' && <TimeTab a={a} win={win} labels={labels} tipL={tipL} />}
            </div>
          </>
        )}
      </div>
      {!empty && (
        <div class={`glass${winLen(win) === 3 || winLen(win) === 6 || winLen(win) === 12 || winLen(win) === MONTHS ? '' : ' free'}`} data-testid="glass" style={{ '--idx': [3, 6, 12, MONTHS].indexOf(winLen(win)) }}>
          <i class="thumb" />
          {([[3, 'st.p3'], [6, 'st.p6'], [12, 'st.p12'], [MONTHS, 'st.pAll']] as const).map(([n, k]) => (
            <button key={n} class={winLen(win) === n && win.to === MONTHS - 1 ? 'on' : ''} data-testid={`glass-${n}`} onClick={() => statsUi.set({ win: presetWin(n) })}>{t(k)}</button>
          ))}
        </div>
      )}
    </>
  );
}

interface TabProps { a: Analytics; win: Win; labels: string[]; tipL: (i: number) => string }

function LineCard({ i, title, value, format, small, d, cfg, testId }: { i: number; title: string; value: number | null; format: (v: number) => string; small?: string; d?: number | null; cfg: LineCfg; testId?: string }) {
  return (
    <Card i={i} title={title} testId={testId}>
      <BigNumber value={value} format={format}>{small}{d !== undefined && <Delta pct={d} />}</BigNumber>
      <LineChart cfg={cfg} />
    </Card>
  );
}

function NewTab({ a, win, labels, tipL }: TabProps) {
  const nv = slice(a.newClients, win), tv = slice(a.totalClients, win);
  const cfgNew = useMemo<LineCfg>(() => ({ labels, tipLabel: tipL, series: [{ values: nv, color: '#007aff', fill: true }], fmt: (v) => t('st.newTip', { n: v }) }), [a, win.from, win.to]);
  const cfgTot = useMemo<LineCfg>(() => ({ labels, tipLabel: tipL, series: [{ values: tv, color: '#34c759', fill: true }], fmt: (v) => t('st.totalTip', { n: v }) }), [a, win.from, win.to]);
  const r = retention(a, win);
  const cfgRet = useMemo<LineCfg>(() => ({
    labels: r.reach.map((_, i) => String(i + 1)), tipLabel: (i) => t('st.retStep', { n: i + 1 }), series: [{ values: r.reach, color: '#af52de', fill: true }],
    fmt: (v) => t('st.retTip', { n: v }), axis: (v) => `${Math.round(v)}%`, max: 100, hint: t('st.retHint'),
  }), [a, win.from, win.to]);
  const diff = tv[tv.length - 1]! - tv[0]!;
  return (
    <>
      <LineCard i={1} title={t('st.newPer')} testId="card-new" value={sum(nv)} format={whole} small={t('st.newBig')} d={delta(a.newClients, win)} cfg={cfgNew} />
      <LineCard i={2} title={t('st.totalClients')} value={tv[tv.length - 1]!} format={whole} small={t('st.totalDelta', { n: `${diff >= 0 ? '+' : ''}${diff}` })} cfg={cfgTot} />
      <LineCard i={3} title={t('st.retention')} testId="card-retention" value={r.count ? r.reach[1]! : null} format={(v) => `${Math.round(v)}%`} small={r.count ? t('st.retBig', { n: r.count }) : t('st.retNone')} cfg={cfgRet} />
    </>
  );
}

function FreqTab({ a, win, labels, tipL, top }: TabProps & { top: number }) {
  const vv = slice(a.visits, win);
  const cfg = useMemo<LineCfg>(() => ({ labels, tipLabel: tipL, series: [{ values: vv, color: '#007aff', fill: true }], fmt: (v) => t('st.visitsTip', { n: v }) }), [a, win.from, win.to]);
  const heat = heatOf(a, win);
  const rows = ranking(a, win, 'visits', top);
  return (
    <>
      <LineCard i={1} title={t('st.visitsPer')} value={sum(vv)} format={whole} small={t('st.visitsBig')} d={delta(a.visits, win)} cfg={cfg} />
      <Card i={2} title={t('st.gap')} testId="card-gap">
        <BigNumber value={a.avgGapDays ? a.avgGapDays / 7 : null} format={(v) => t('st.w', { n: num.format(v) })}>{t('st.gapBig')}</BigNumber>
        <p class="sub-head">{t('st.gapLate')}</p>
        {a.gaps.length === 0 ? <p class="hint">{t('st.gapNone')}</p> : (
          <div class="rank">
            {a.gaps.slice(0, 5).map((g, i) => (
              <button key={g.id} class="rk gap" data-testid={`gap-${i}`} onClick={() => ui.set({ client: g.id })}>
                <span class="top"><b>{g.name}</b><span>{t('st.gapEvery', { tarpas: gapText(g.gapDays) })}</span></span>
                <span class="gapline"><i style={{ transform: `scaleX(${Math.min(1, g.ratio * 0.38).toFixed(3)})` }} /></span>
                <span class="gapnote">{t('st.gapNow', { tarpas: gapText(g.sinceDays), p: Math.round(g.ratio * 100) })}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card i={3} title={t('st.when')}>
        <HeatMap heat={heat} dayLabels={Array.from({ length: 7 }, (_, i) => weekdayAbbr(i))} bandLabels={[t('st.band0'), t('st.band1'), t('st.band2'), t('st.band3')]}
          tip={(d, b, n) => t('st.whenTip', { diena: weekdayName(d), dalis: [t('st.band0'), t('st.band1'), t('st.band2'), t('st.band3')][b]!.toLowerCase(), n })} />
      </Card>
      <Card i={4} title={t('st.rankVisits')}>
        <Rank rows={rows} unit={(v) => t('st.rkVisits', { n: v })} color="#007aff"
          detail={(r) => t('st.rkDetailVisits', { n: r.total, data: r.lastStart ? formatDayShort(r.lastStart) : '–' })} />
      </Card>
    </>
  );
}

function ProfitTab({ a, win, labels, tipL, top }: TabProps & { top: number }) {
  const rv = slice(a.cents, win).map((c) => Math.round(c / 100)), av = slice(a.avgCents, win).map((c) => Math.round(c / 100)), lp = slice(a.lostCents, win).map((c) => Math.round(c / 100));
  const k = (v: number) => (v >= 1000 ? `${num.format(v / 1000)}k` : String(Math.round(v)));
  const eur = (v: number) => formatEuroRound(v * 100);
  const cfgRv = useMemo<LineCfg>(() => ({ labels, tipLabel: tipL, series: [{ values: rv, color: '#34c759', fill: true }], fmt: eur, axis: k }), [a, win.from, win.to]);
  const cfgAv = useMemo<LineCfg>(() => ({ labels, tipLabel: tipL, series: [{ values: av, color: '#ff9500', fill: true }], fmt: eur }), [a, win.from, win.to]);
  const cfgLs = useMemo<LineCfg>(() => ({ labels, tipLabel: tipL, series: [{ values: lp, color: '#ff9500', fill: true }], fmt: (v) => t('st.lostTip', { suma: eur(v) }), hint: t('st.lostHint'), axis: k }), [a, win.from, win.to]);
  const rec = records(a, win);
  const totalCents = sum(slice(a.cents, win)), visits = sum(slice(a.visits, win));
  const split = serviceSplit(a, win).map((s) => ({ label: s.name, value: s.cents }));
  const rows = ranking(a, win, 'cents', top);
  return (
    <>
      <Card i={1} title={t('st.records')} testId="card-records">
        <div class="recs">
          <div class="rec"><small>{t('st.recBusy')}</small><b data-testid="rec-busy">{rec.busiest ? monthYear(a.keys[rec.busiest.month]!) : '–'}</b><span>{rec.busiest ? t('st.recVisits', { n: rec.busiest.value }) : ''}</span></div>
          <div class="rec"><small>{t('st.recRich')}</small><b data-testid="rec-rich">{rec.richest ? monthYear(a.keys[rec.richest.month]!) : '–'}</b><span>{rec.richest ? formatEuroRound(rec.richest.value) : ''}</span></div>
          <div class="rec"><small>{t('st.recDay')}</small><b data-testid="rec-day">{rec.bestDay ? weekdayName(rec.bestDay.weekday) : '–'}</b><span>{rec.bestDay ? t('st.recVisits', { n: rec.bestDay.value }) : ''}</span></div>
        </div>
      </Card>
      <LineCard i={2} title={t('st.income')} testId="card-income" value={totalCents / 100} format={(v) => formatEuroRound(v * 100)} small={t('st.incomeSub', { suma: formatEuroRound(totalCents / winLen(win)) })} d={delta(a.cents, win)} cfg={cfgRv} />
      <LineCard i={3} title={t('st.avgTicket')} value={visits ? totalCents / visits / 100 : 0} format={(v) => formatEuroRound(v * 100)} small={t('st.perVisit')} d={delta(a.avgCents, win, mean)} cfg={cfgAv} />
      <LineCard i={4} title={t('st.lost')} testId="card-lost" value={sum(lp)} format={(v) => formatEuroRound(v * 100)} small={t('st.lostSub', { a: sum(slice(a.missed, win)), b: sum(slice(a.cancelled, win)) })} d={delta(a.lostCents, win, sum)} cfg={cfgLs} />
      <Card i={5} title={t('st.byService')}>
        <Donut items={split} fmt={(v) => formatEuroRound(v)} centerLabel={t('st.sumAll')} />
      </Card>
      <Card i={6} title={t('st.rankSpent')}>
        <Rank rows={rows} unit={(v) => formatEuroRound(v)} color="#34c759"
          detail={(r) => t('st.rkDetailMoney', { suma: formatEuro(r.spent), n: r.total })} />
      </Card>
    </>
  );
}

function TimeTab({ a, win, labels, tipL }: TabProps) {
  const ut = slice(a.util, win), hw = slice(a.booked, win), hf = slice(a.free, win), ho = slice(a.off, win), ph = slice(a.perHour, win).map((c) => Math.round(c / 100));
  const cfgUt = useMemo<LineCfg>(() => ({ labels, tipLabel: tipL, max: 100, series: [{ values: ut, color: '#5856d6', fill: true }], fmt: (v) => t('st.utilTip', { n: v }), axis: (v) => `${Math.round(v)}%` }), [a, win.from, win.to]);
  const cfgHr = useMemo<LineCfg>(() => ({
    labels, tipLabel: tipL, series: [{ values: hw.map(Math.round), color: '#007aff', fill: true }, { values: hf.map(Math.round), color: '#8e8e93' }],
    fmt: (v) => t('st.hUnit', { n: v }), hint: t('st.hoursHint'),
  }), [a, win.from, win.to]);
  const cfgPh = useMemo<LineCfg>(() => ({ labels, tipLabel: tipL, series: [{ values: ph, color: '#34c759', fill: true }], fmt: (v) => t('st.perHourUnit', { suma: formatEuroRound(v * 100) }) }), [a, win.from, win.to]);
  const hours = sum(hw);
  return (
    <>
      <LineCard i={1} title={t('st.util')} testId="card-util" value={mean(ut)} format={(v) => `${Math.round(v)}%`} small={t('st.utilBig')} d={delta(a.util, win, mean)} cfg={cfgUt} />
      <Card i={2} title={t('st.hours')}>
        <div class="st3">
          {([[hw, 'st.hWorked'], [hf, 'st.hFree'], [ho, 'st.hOff']] as const).map(([v, k]) => (
            <div class="st" key={k}><BigNumber size="s" value={sum(v)} format={(x) => t('st.hUnit', { n: Math.round(x) })} /><small>{t(k)}</small></div>
          ))}
        </div>
      </Card>
      <Card i={3} title={t('st.hoursChart')}><LineChart cfg={cfgHr} /></Card>
      <LineCard i={4} title={t('st.perHour')} value={hours ? sum(slice(a.cents, win)) / hours / 100 : 0} format={(v) => t('st.perHourUnit', { suma: formatEuroRound(v * 100) })} small={t('st.perHourSub')} d={delta(a.perHour, win, mean)} cfg={cfgPh} />
    </>
  );
}
