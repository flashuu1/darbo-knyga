import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clampWin, MONTHS, winLen, type Win } from '../../logic/analytics';
import { t } from '../../i18n/lt';
import { tween } from '../motion';

/* Charts for the Analizė page. They are drawn imperatively into SVG attributes: while a chart glides to new data
   (about 0.5 s) only a few attributes change per frame, and Preact is not involved at all. */

const NS = 'http://www.w3.org/2000/svg';
const W = 340, H = 150, PL = 32, PR = 8, PT = 12, PB = 20;
function mk<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element, cls?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (cls) e.setAttribute('class', cls);
  parent.appendChild(e);
  return e;
}
const resample = (arr: number[], n: number): number[] => {
  if (arr.length === n) return arr.slice();
  if (arr.length < 2) return new Array<number>(n).fill(arr[0] ?? 0);
  return Array.from({ length: n }, (_, i) => { const x = i / (n - 1) * (arr.length - 1), a = Math.floor(x), b = Math.min(arr.length - 1, a + 1); return arr[a]! + (arr[b]! - arr[a]!) * (x - a); });
};

export interface LineSeries { values: number[]; color: string; fill?: boolean }
export interface LineCfg {
  labels: string[]; series: LineSeries[];
  /** Fixed top of the scale (otherwise the largest value plus a margin). */
  max?: number; axis?: (v: number) => string;
  tipLabel?: (i: number) => string; fmt: (v: number, i: number) => string; hint?: string;
}

class LineSvg {
  private cfg!: LineCfg;
  private cur: { vals: number[][]; max: number } | null = null;
  private stop = () => {};
  private built = '';
  private els!: { gl: SVGLineElement[]; gt: SVGTextElement[]; area: (SVGPathElement | null)[]; line: SVGPathElement[]; dots: SVGCircleElement[][]; cross: SVGLineElement; cdots: SVGCircleElement[] };
  sel: number | null = null;
  private down = false;
  constructor(private svg: SVGSVGElement, private onSel: (i: number | null) => void) {
    svg.addEventListener('pointerdown', this.onDown);
    svg.addEventListener('pointermove', this.onMove);
    svg.addEventListener('pointerup', this.onUp);
    svg.addEventListener('pointercancel', this.onUp);
  }
  destroy() {
    this.stop();
    this.svg.removeEventListener('pointerdown', this.onDown); this.svg.removeEventListener('pointermove', this.onMove);
    this.svg.removeEventListener('pointerup', this.onUp); this.svg.removeEventListener('pointercancel', this.onUp);
  }
  private X = (i: number) => { const n = this.cfg.labels.length; return PL + (n === 1 ? 0.5 : i / (n - 1)) * (W - PL - PR); };
  private Y = (v: number, max: number) => H - PB - v / max * (H - PB - PT);
  private build() {
    const c = this.cfg, n = c.labels.length;
    this.svg.replaceChildren();
    const gl: SVGLineElement[] = [], gt: SVGTextElement[] = [];
    for (let k = 0; k <= 3; k++) {
      gl.push(mk('line', { x1: PL, x2: W - PR }, this.svg, k ? 'lc-grid dash' : 'lc-grid'));
      gt.push(mk('text', { x: PL - 5, 'text-anchor': 'end' }, this.svg));
    }
    const every = Math.ceil(n / 6);
    c.labels.forEach((l, i) => { if (i % every === 0) { const tx = mk('text', { x: this.X(i), y: H - 5, 'text-anchor': 'middle' }, this.svg); tx.textContent = l; } });
    const area: (SVGPathElement | null)[] = [], line: SVGPathElement[] = [], dots: SVGCircleElement[][] = [];
    for (const s of c.series) {
      area.push(s.fill ? mk('path', { fill: s.color, opacity: 0.14 }, this.svg) : null);
      line.push(mk('path', { fill: 'none', stroke: s.color, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, this.svg));
      dots.push(n <= 14 ? c.labels.map(() => mk('circle', { r: 2.6, stroke: s.color, 'stroke-width': 1.6 }, this.svg, 'lc-dot')) : []);
    }
    const cross = mk('line', { y1: PT, y2: H - PB, visibility: 'hidden' }, this.svg, 'lc-cross');
    const cdots = c.series.map((s) => mk('circle', { r: 5, fill: s.color, visibility: 'hidden' }, this.svg, 'lc-pin'));
    this.els = { gl, gt, area, line, dots, cross, cdots };
  }
  private paint() {
    const cur = this.cur!, c = this.cfg, n = c.labels.length, e = this.els, max = cur.max;
    for (let k = 0; k <= 3; k++) {
      const y = this.Y(max * k / 3, max);
      e.gl[k]!.setAttribute('y1', String(y)); e.gl[k]!.setAttribute('y2', String(y));
      e.gt[k]!.setAttribute('y', String(y + 3)); e.gt[k]!.textContent = c.axis ? c.axis(max * k / 3) : String(Math.round(max * k / 3));
    }
    c.series.forEach((_, si) => {
      const vals = cur.vals[si]!, xs = vals.map((_v, i) => this.X(i)), ys = vals.map((v) => this.Y(v, max));
      let d = `M${xs[0]!.toFixed(1)} ${ys[0]!.toFixed(1)}`;
      for (let i = 1; i < n; i++) { const cx = (xs[i - 1]! + xs[i]!) / 2; d += `C${cx.toFixed(1)} ${ys[i - 1]!.toFixed(1)} ${cx.toFixed(1)} ${ys[i]!.toFixed(1)} ${xs[i]!.toFixed(1)} ${ys[i]!.toFixed(1)}`; }
      e.line[si]!.setAttribute('d', d);
      e.area[si]?.setAttribute('d', `${d}L${xs[n - 1]!.toFixed(1)} ${this.Y(0, max)}L${xs[0]!.toFixed(1)} ${this.Y(0, max)}Z`);
      e.dots[si]!.forEach((dot, i) => { dot.setAttribute('cx', String(xs[i])); dot.setAttribute('cy', String(ys[i])); });
    });
    this.paintSel();
  }
  private paintSel() {
    const e = this.els, n = this.cfg.labels.length, cur = this.cur;
    const on = this.sel !== null && this.sel < n && !!cur;
    e.cross.setAttribute('visibility', on ? 'visible' : 'hidden');
    e.cdots.forEach((d) => d.setAttribute('visibility', on ? 'visible' : 'hidden'));
    if (!on || !cur) return;
    const x = this.X(this.sel!);
    e.cross.setAttribute('x1', String(x)); e.cross.setAttribute('x2', String(x));
    e.cdots.forEach((d, si) => { d.setAttribute('cx', String(x)); d.setAttribute('cy', String(this.Y(cur.vals[si]![this.sel!]!, cur.max))); });
  }
  /** New data: glide from what is on screen (resampled when the number of points changes). */
  set(cfg: LineCfg) {
    this.cfg = cfg;
    const n = cfg.labels.length, key = `${n}|${cfg.series.map((s) => (s.fill ? 'f' : 'l') + s.color).join()}|${cfg.labels.join()}`;
    if (key !== this.built) { this.built = key; this.build(); }
    if (this.sel !== null && this.sel >= n) { this.sel = null; this.onSel(null); }
    const tv = cfg.series.map((s) => s.values), tmax = cfg.max ?? Math.max(...tv.flat(), 1) * 1.1;
    const fromVals = this.cur ? cfg.series.map((_, si) => resample(this.cur!.vals[si] ?? this.cur!.vals[0]!, n)) : tv.map((v) => v.map(() => 0));
    const from = [...fromVals.flat(), this.cur ? this.cur.max : tmax], to = [...tv.flat(), tmax];
    this.stop();
    this.stop = tween(from, to, this.cur ? 480 : 750, (arr) => {
      const vals: number[][] = []; let o = 0;
      for (const v of tv) { vals.push(arr.slice(o, o + v.length)); o += v.length; }
      this.cur = { vals, max: arr[arr.length - 1]! }; this.paint();
    });
  }
  private pick(ev: PointerEvent) {
    if (!this.cur) return;
    const r = this.svg.getBoundingClientRect(), n = this.cfg.labels.length;
    const x = (ev.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((x - PL) / (W - PL - PR) * (n - 1))));
    if (i !== this.sel) { this.sel = i; this.paintSel(); this.onSel(i); }
  }
  private onDown = (ev: PointerEvent) => { this.down = true; try { this.svg.setPointerCapture(ev.pointerId); } catch { /* gone */ } this.pick(ev); };
  private onMove = (ev: PointerEvent) => { if (this.down || ev.pointerType === 'mouse') this.pick(ev); };
  private onUp = () => { this.down = false; };
}

/** An interactive line / area chart: touch or drag across it to read a value. `cfg` must be memoised by the caller. */
export function LineChart({ cfg }: { cfg: LineCfg }) {
  const svg = useRef<SVGSVGElement>(null);
  const chart = useRef<LineSvg | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { chart.current = new LineSvg(svg.current!, setSel); return () => chart.current?.destroy(); }, []);
  useEffect(() => { chart.current?.set(cfg); }, [cfg]);
  const n = cfg.labels.length;
  const on = sel !== null && sel < n;
  const tip = on ? `${cfg.tipLabel ? cfg.tipLabel(sel) : cfg.labels[sel]}: ${cfg.series.map((s) => cfg.fmt(s.values[sel]!, sel)).join(' · ')}` : cfg.hint ?? t('st.hint');
  return (
    <>
      <div class={on ? 'lc-tip on' : 'lc-tip'} data-testid="chart-tip">{tip}</div>
      <svg ref={svg} class="lc" viewBox={`0 0 ${W} ${H}`} role="img" data-testid="chart" />
    </>
  );
}

/** A big number that counts to its new value. `children` is the small text next to it. */
export function BigNumber({ value, format, size, children, testId }: { value: number | null; format: (v: number) => string; size?: 's'; children?: ComponentChildren; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === null) { el.textContent = '–'; shown.current = 0; return; }
    return tween([shown.current], [value], 600, (a) => { shown.current = a[0]!; el.textContent = fmt.current(a[0]!); });
  }, [value]);
  return <div class={size === 's' ? 'bignum s' : 'bignum'} data-testid={testId}><span ref={ref} />{children && <small>{children}</small>}</div>;
}

/** "↑ 12%" against the previous period; nothing when there is nothing to compare. */
export function Delta({ pct, neutral }: { pct: number | null; neutral?: boolean }) {
  if (pct === null) return null;
  return <span class={neutral ? 'delta nu' : pct >= 0 ? 'delta up' : 'delta dn'}>{pct >= 0 ? '↑' : '↓'} {Math.abs(pct)}%</span>;
}

export const PALETTE = ['#007aff', '#34c759', '#af52de', '#ff9500', '#ff2d55', '#30b0c7', '#5856d6'];
/** A ring split into slices that glide when the data changes; a slice can be touched (it steps out, the rest dims). */
export function Donut({ items, fmt, centerLabel }: { items: { label: string; value: number }[]; fmt: (v: number) => string; centerLabel: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const big = useRef<SVGTextElement>(null);
  const sub = useRef<SVGTextElement>(null);
  const cur = useRef<number[]>(items.map(() => 0));
  const selRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const paint = (vals: number[]) => {
    cur.current = vals;
    const total = vals.reduce((a, b) => a + b, 0) || 1, R = 68, r = 42, c = 75;
    let a0 = -Math.PI / 2;
    const pt = (rad: number, a: number) => `${(c + rad * Math.cos(a)).toFixed(2)} ${(c + rad * Math.sin(a)).toFixed(2)}`;
    vals.forEach((v, i) => {
      const sw = Math.min(v / total, 0.9999) * Math.PI * 2, a1 = a0 + sw, mid = (a0 + a1) / 2, big_ = sw > Math.PI ? 1 : 0;
      const p = paths.current[i];
      if (p) {
        p.setAttribute('d', sw < 0.002 ? '' : `M${pt(R, a0)}A${R} ${R} 0 ${big_} 1 ${pt(R, a1)}L${pt(r, a1)}A${r} ${r} 0 ${big_} 0 ${pt(r, a0)}Z`);
        const on = selRef.current === i;
        p.style.transform = on ? `translate(${(Math.cos(mid) * 5).toFixed(2)}px, ${(Math.sin(mid) * 5).toFixed(2)}px)` : 'none';
        p.style.opacity = selRef.current === null || on ? '1' : '.35';
      }
      a0 = a1;
    });
    const s = selRef.current;
    if (big.current) big.current.textContent = fmt(s !== null ? vals[s] ?? 0 : vals.reduce((a, b) => a + b, 0));
    if (sub.current) sub.current.textContent = s !== null ? `${Math.round((vals[s] ?? 0) / total * 100)}%` : centerLabel;
  };
  useEffect(() => tween(cur.current.length === items.length ? cur.current : items.map(() => 0), items.map((i) => i.value), 650, paint), [items.map((i) => i.value).join()]);
  useEffect(() => { selRef.current = sel; paint(cur.current); }, [sel]);
  return (
    <div class="donutwrap">
      <svg class="donut" viewBox="0 0 150 150" role="img" data-testid="donut">
        {items.map((_, i) => <path key={i} ref={(el) => { paths.current[i] = el; }} fill={PALETTE[i % PALETTE.length]} data-testid={`slice-${i}`} onClick={() => setSel(sel === i ? null : i)} />)}
        <text ref={big} x="75" y="72" class="donut-big" />
        <text ref={sub} x="75" y="88" class="donut-sub" />
      </svg>
      <div class="legend">
        {items.map((it, i) => (
          <button key={it.label} class={sel === i ? 'on' : ''} data-testid={`legend-${i}`} onClick={() => setSel(sel === i ? null : i)}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} /><span>{it.label}</span><em>{fmt(it.value)}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Weekday x time of day: a grid whose cells get darker the more visits they hold. */
export function HeatMap({ heat, dayLabels, bandLabels, tip }: { heat: number[][]; dayLabels: string[]; bandLabels: string[]; tip: (d: number, b: number, n: number) => string }) {
  const [sel, setSel] = useState<[number, number] | null>(null);
  const max = Math.max(1, ...heat.flat());
  return (
    <>
      <div class={sel ? 'lc-tip on' : 'lc-tip'} data-testid="heat-tip">{sel ? tip(sel[0], sel[1], heat[sel[0]]![sel[1]]!) : t('st.whenHint')}</div>
      <div class="heat" data-testid="heat">
        <span />{bandLabels.map((b) => <span key={b} class="h">{b}</span>)}
        {heat.map((row, d) => (
          <>
            <span key={`d${d}`} class="d">{dayLabels[d]}</span>
            {row.map((v, b) => (
              <button key={`${d}-${b}`} class={sel && sel[0] === d && sel[1] === b ? 'on' : ''} data-testid={`heat-${d}-${b}`}
                style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(v / max * 85)}%, var(--fill))` }} onClick={() => setSel([d, b])}>{v || ''}</button>
            ))}
          </>
        ))}
      </div>
    </>
  );
}

/** The grey mini-chart of all 24 months with a window on it: drag it, drag its edges to stretch it. */
export function PeriodBar({ bars, win, onChange, label }: { bars: number[]; win: Win; onChange: (w: Win) => void; label: string }) {
  const step = W / MONTHS;
  const mx = Math.max(1, ...bars);
  const drag = useRef<{ mode: 'l' | 'r' | 'm'; grab: number } | null>(null);
  const pending = useRef<Win | null>(null);
  const raf = useRef(0);
  const winRef = useRef(win);
  winRef.current = win;
  const push = (w: Win) => { // at most one change per frame while a finger drags
    pending.current = w;
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; if (pending.current) onChange(pending.current); pending.current = null; });
  };
  const ux = (e: PointerEvent) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); return (e.clientX - r.left) / r.width * W; };
  const down = (e: PointerEvent) => {
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    const x = ux(e), w = winRef.current, x0 = w.from * step, x1 = (w.to + 1) * step;
    if (Math.abs(x - x0) < 16) drag.current = { mode: 'l', grab: 0 };
    else if (Math.abs(x - x1) < 16) drag.current = { mode: 'r', grab: 0 };
    else if (x > x0 && x < x1) drag.current = { mode: 'm', grab: x - x0 };
    else { // a tap outside moves the window there
      const n = winLen(w), from = Math.max(0, Math.min(MONTHS - n, Math.round(x / step - n / 2)));
      drag.current = { mode: 'm', grab: x - from * step }; push({ from, to: from + n - 1 });
    }
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const x = ux(e), w = winRef.current;
    if (d.mode === 'l') push(clampWin({ from: Math.round(x / step), to: w.to }));
    else if (d.mode === 'r') push(clampWin({ from: w.from, to: Math.round(x / step - 1) }));
    else { const n = winLen(w), from = Math.max(0, Math.min(MONTHS - n, Math.round((x - d.grab) / step))); push({ from, to: from + n - 1 }); }
  };
  const up = () => { drag.current = null; };
  const x0 = win.from * step, x1 = (win.to + 1) * step;
  return (
    <svg class="ov" viewBox={`0 0 ${W} 52`} role="slider" aria-label={label} data-testid="period-bar" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {bars.map((v, k) => { const h = Math.max(1.5, v / mx * 34); return <rect key={k} x={k * step + 1.5} y={46 - h} width={step - 3} height={h} rx="2" class="ov-bar" />; })}
      <rect x={x0} y="2" width={x1 - x0} height="48" rx="8" class="ov-win" />
      <rect x={x0 - 3} y="14" width="7" height="24" rx="3.5" class="ov-handle" />
      <rect x={x1 - 4} y="14" width="7" height="24" rx="3.5" class="ov-handle" />
    </svg>
  );
}
