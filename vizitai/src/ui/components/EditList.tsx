import type { ComponentChildren, CSSProperties } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n/lt';
import { primeKeyboard } from '../actions';
import { ChevronIcon, NextIcon, PlusIcon, TrashIcon } from '../icons';

/** The ways a duration is picked: quick chips, and a stepper for anything in between (quarter hours up to two hours, half hours beyond). */
const PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];
const stepFor = (minutes: number) => (minutes < 120 ? 15 : 30);
export const formatMinutes = (m: number) => {
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} ${t('unit.hour')} ${r} ${t('unit.min')}` : `${h} ${t('unit.hour')}`) : `${r} ${t('unit.min')}`;
};
/** "1 val 30 min" with the units small, for the right side of a row. */
export function Dur({ m }: { m: number }) {
  const h = Math.floor(m / 60), r = m % 60;
  return <>{h > 0 && <>{h}<small>{t('unit.hour')}</small></>}{h > 0 && r > 0 && ' '}{(r > 0 || h === 0) && <>{r}<small>{t('unit.min')}</small></>}</>;
}

export function DurationEditor({ prefix, i, minutes, max, onChange }: { prefix: string; i: number; minutes: number; max: number; onChange: (m: number) => void }) {
  const chips = [...new Set([...PRESETS.filter((p) => p <= max), minutes])].sort((a, b) => a - b);
  const chipRow = useRef<HTMLDivElement>(null);
  useEffect(() => { // the chosen chip is in view when the row opens and when the stepper moves it
    const row = chipRow.current, on = row?.querySelector<HTMLElement>('.chip.on');
    if (row && on) row.scrollTo({ left: on.offsetLeft - row.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' });
  }, [minutes]);
  return (
    <>
      <div class="ed-lab ed-lab-row">
        <span>{t('edit.duration')}</span>
        <span class="stepper">
          <button data-testid={`${prefix}-minus-${i}`} aria-label={t('edit.shorter')} disabled={minutes <= 15} onClick={() => onChange(Math.max(15, minutes - stepFor(minutes - 1)))}>−</button>
          <span class="stepper-val" data-testid={`${prefix}-minutes-${i}`}>{formatMinutes(minutes)}</span>
          <button data-testid={`${prefix}-plus-${i}`} aria-label={t('edit.longer')} disabled={minutes >= max} onClick={() => onChange(Math.min(max, minutes + stepFor(minutes)))}>+</button>
        </span>
      </div>
      <div class="ed-chips" ref={chipRow}>
        {chips.map((m) => <button key={m} class={m === minutes ? 'chip on' : 'chip'} data-testid={`${prefix}-chip-${i}-${m}`} onClick={() => onChange(m)}>{formatMinutes(m)}</button>)}
      </div>
    </>
  );
}

export interface EditItem {
  id: string;
  name: string;
  /** the colour of the row's tint, dot and numbers: a CSS colour */
  tint: string;
  lead: ComponentChildren;
  /** the right side of the closed row */
  value: ComponentChildren;
  /** greyed while closed (a hidden service) */
  off?: boolean;
}

/**
 * How the rows move. Every change of layout (a row opening, folding, a field appearing, a row moved, added or deleted) is played
 * as transforms only: the layout is changed at once, and what moved is animated from where it was seen to where it is now
 * (the "FLIP" way), the row that grew is revealed with a clip. No height, grid or margin is ever animated, so the whole list
 * stays on the compositor and does not re-layout 60 times a second.
 */
export interface FlipOptions {
  /** the element to bring into view (above the keyboard if `kb`), once the layout has changed */
  reveal?: () => HTMLElement | null | undefined;
  /** the height to assume for the keyboard that is coming up (0: none) */
  kb?: number;
}
export interface RowsApi {
  /** runs `change` (a state change of the row or of something inside it) and animates the layout it causes */
  flip: (change: () => void, o?: FlipOptions) => void;
  /** folds the open row with an animation */
  fold: () => void;
}
export const RowsContext = createContext<RowsApi>({ flip: (c) => c(), fold: () => {} });
export const useRows = () => useContext(RowsContext);

const MOVE_MS = 360;
const EASE = 'cubic-bezier(.32, .72, 0, 1)';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
interface Spot { top: number; h: number }

interface Props {
  /** test-id prefix: svc, opt-personal, opt-expense */
  prefix: string;
  items: EditItem[];
  addLabel: string;
  /** makes the new item; returns its id so the row can open with the cursor in its name */
  onAdd: () => Promise<string>;
  onRename: (id: string, name: string) => Promise<void>;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  /** the part between the name and the buttons (only the open row has one) */
  editor: (id: string, i: number) => ComponentChildren;
  /** the left end of the bottom line (the switch that shows or hides a service) */
  extra?: (id: string, i: number) => ComponentChildren;
  note: string;
}

/**
 * One row per item, the whole of it editable in place: a tap opens the row (the rows below glide down), a tap again or on
 * another row closes it. The same list for Paslaugos, Asmeniniai and Išlaidų rūšys. Only the open row has its editor in the page.
 */
export function EditList({ prefix, items, addLabel, onAdd, onRename, onMove, onDelete, editor, extra, note }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null); // the item just added: its row opens and its name gets the cursor
  const root = useRef<HTMLDivElement>(null);
  const busy = useRef(false); // a row is folding: taps wait
  const pending = useRef<{ first: Map<string, Spot>; o: FlipOptions } | null>(null);
  const rest = useRef<{ spots: Map<string, Spot>; scroll: number; order: string } | null>(null);
  const settle = useRef<Animation[] | null>(null);
  const focusAfter = useRef<string | null>(null);
  const orderNow = useRef('');
  orderNow.current = items.map((x) => x.id).join('|');

  const rows = () => (root.current ? [...root.current.querySelectorAll<HTMLElement>('.er')] : []);
  const rowEl = (id: string) => rows().find((e) => e.dataset.id === id);
  const scroller = () => root.current?.closest<HTMLElement>('.settings-body') ?? null;
  /** where the rows are drawn now, transforms included (what her eye sees) */
  const seen = () => new Map(rows().map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.id!, { top: r.top, h: r.height }] as const; }));
  /** where the rows are in the layout, transforms left out */
  const placed = () => {
    const list = root.current?.querySelector<HTMLElement>('.er-list'), top = list?.getBoundingClientRect().top ?? 0;
    return new Map(rows().map((e) => [e.dataset.id!, { top: top + e.offsetTop, h: e.offsetHeight }] as const));
  };

  function reveal(el: HTMLElement, kb: number) {
    const sc = scroller();
    if (!sc) return;
    const s = sc.getBoundingClientRect(), r = el.getBoundingClientRect();
    const bottom = kb > 0 ? window.innerHeight - kb - 64 : s.bottom - 12, top = s.top + 8;
    let d = 0;
    if (r.bottom > bottom) d = Math.min(r.bottom - bottom, r.top - top); // never scroll the top of it out of sight
    else if (r.top < top) d = r.top - top;
    if (Math.abs(d) > 1) sc.scrollTop += d; // at once: the glide below is what she sees
  }

  function play(first: Map<string, Spot>, o: FlipOptions) {
    const els = rows();
    els.forEach((e) => e.getAnimations().forEach((a) => a.cancel()));
    const target = o.reveal?.();
    if (target) reveal(target, o.kb ?? 0);
    const last = placed();
    if (!reduced()) {
      for (const e of els) {
        const f = first.get(e.dataset.id!), l = last.get(e.dataset.id!);
        if (!f || !l) continue;
        const dy = f.top - l.top;
        if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: EASE });
        const grew = l.h - f.h;
        if (grew > 1) { // what grew is uncovered from the top, like a card unfolding
          const rad = getComputedStyle(e).borderTopLeftRadius;
          e.animate([{ clipPath: `inset(0 0 ${grew}px 0 round ${rad})` }, { clipPath: `inset(0 0 0 0 round ${rad})` }], { duration: MOVE_MS, easing: EASE });
        }
      }
    }
    rest.current = { spots: last, scroll: scroller()?.scrollTop ?? 0, order: orderNow.current };
  }

  const flip = (change: () => void, o: FlipOptions = {}) => {
    pending.current = { first: seen(), o };
    change();
    requestAnimationFrame(() => { // after the change is drawn into the page, before it is painted
      const p = pending.current;
      if (p) { pending.current = null; play(p.first, p.o); }
    });
  };

  useLayoutEffect(() => {
    if (settle.current) { settle.current.forEach((a) => a.cancel()); settle.current = null; } // a fold has finished: the page is now what it showed
    const p = pending.current;
    if (p) { pending.current = null; play(p.first, p.o); return; }
    const order = orderNow.current, r = rest.current, sc = scroller();
    if (r && sc && r.order !== order) { // rows were added, moved or deleted: they glide from where they were
      const first = new Map([...r.spots].map(([id, s]) => [id, { top: s.top + (r.scroll - sc.scrollTop), h: s.h }] as const));
      play(first, {});
    } else {
      rest.current = { spots: placed(), scroll: sc?.scrollTop ?? 0, order };
    }
  });

  const fold = () => {
    if (!open || busy.current) return;
    const row = rowEl(open), ed = row?.querySelector<HTMLElement>('.er-ed');
    if (!row || !ed || reduced()) { setOpen(null); return; }
    (document.activeElement as HTMLElement | null)?.blur();
    busy.current = true;
    const delta = ed.getBoundingClientRect().height, rad = getComputedStyle(row).borderTopLeftRadius;
    const opts: KeyframeAnimationOptions = { duration: 300, easing: EASE, fill: 'forwards' };
    const anims = [
      row.animate([{ clipPath: `inset(0 0 0 0 round ${rad})` }, { clipPath: `inset(0 0 ${delta}px 0 round ${rad})` }], opts),
      ed.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, easing: 'ease-out', fill: 'forwards' }),
      ...rows().slice(rows().indexOf(row) + 1).map((e) => e.animate([{ transform: 'none' }, { transform: `translateY(${-delta}px)` }], opts)),
    ];
    window.setTimeout(() => { settle.current = anims; busy.current = false; setOpen(null); }, 300);
  };

  const choose = (id: string) => {
    (document.activeElement as HTMLElement | null)?.blur(); // a tap on a row while the keyboard is up lowers the keyboard and folds the row in one go
    if (busy.current) return;
    if (open === id) { fold(); return; }
    const opening = () => flip(() => setOpen(id), { reveal: () => rowEl(id) });
    const old = open && rowEl(open)?.querySelector<HTMLElement>('.er-ed-in');
    if (old && !reduced()) { // the open row lets go of its content first, then the new one opens
      busy.current = true;
      old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' });
      window.setTimeout(() => { busy.current = false; opening(); }, 90);
    } else opening();
  };

  useEffect(() => { // an item was just added: it opens, and its name takes the cursor, selected
    if (!focusId || !items.some((x) => x.id === focusId)) return;
    focusAfter.current = focusId;
    flip(() => setOpen(focusId), { reveal: () => rowEl(focusId), kb: 340 });
    setFocusId(null);
  }, [focusId, items]);
  useEffect(() => {
    if (!open || focusAfter.current !== open) return;
    focusAfter.current = null;
    const input = rowEl(open)?.querySelector<HTMLInputElement>('.er-input');
    if (input) { input.focus({ preventScroll: true }); input.select(); }
  }, [open]);

  return (
    <RowsContext.Provider value={{ flip, fold }}>
      <div ref={root}>
        <div class="er-list">
          {items.map((it, i) => {
            const isOpen = open === it.id;
            return (
              <div key={it.id} data-id={it.id} class={`er${isOpen ? ' open' : ''}${it.off ? ' off' : ''}`} style={{ '--tint': it.tint } as CSSProperties} data-testid={`${prefix}-row-${i}`}>
                <button class="er-top" data-testid={`${prefix}-open-${i}`} aria-expanded={isOpen} onClick={() => choose(it.id)}>
                  {it.lead}
                  <span class="er-name">{it.name}</span>
                  <span class="er-val">{it.value}</span>
                  <span class="er-chev" aria-hidden="true"><NextIcon /></span>
                </button>
                {isOpen && (
                  <div class="er-ed">
                    <div class="er-ed-in">
                      <input class="er-input" data-testid={`${prefix}-name-${i}`} defaultValue={it.name} key={`${it.id}${it.name}${tick}`} autocomplete="off" autocapitalize="sentences" aria-label={t('edit.name')}
                        onChange={(e) => void onRename(it.id, (e.target as HTMLInputElement).value).then(() => setTick((x) => x + 1))} />
                      {editor(it.id, i)}
                      <div class="er-foot">
                        {extra?.(it.id, i)}
                        <span class="er-spacer" />
                        <button class="sq up" data-testid={`${prefix}-up-${i}`} aria-label={t('edit.up')} disabled={i === 0} onClick={() => onMove(it.id, -1)}><ChevronIcon /></button>
                        <button class="sq" data-testid={`${prefix}-down-${i}`} aria-label={t('edit.down')} disabled={i === items.length - 1} onClick={() => onMove(it.id, 1)}><ChevronIcon /></button>
                        <button class="sq red" data-testid={`${prefix}-delete-${i}`} aria-label={t('btn.delete')} onClick={() => onDelete(it.id)}><TrashIcon /></button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button class="er-add" data-testid={`${prefix}-add`} onClick={() => { primeKeyboard(); void onAdd().then(setFocusId); }}><PlusIcon />{addLabel}</button>
        <p class="section-foot">{note}</p>
      </div>
    </RowsContext.Provider>
  );
}

/** A switch like iOS's: a pill, 51 by 31 (the touch area is larger than what is drawn). */
export function Switch({ on, label, testId, onChange }: { on: boolean; label: string; testId: string; onChange: (on: boolean) => void }) {
  return <button class={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label={label} data-testid={testId} onClick={() => onChange(!on)}><span class="knob" /></button>;
}
