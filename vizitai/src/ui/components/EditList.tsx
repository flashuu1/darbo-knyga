import type { ComponentChildren, CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
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
  /** the part between the name and the buttons; `close` folds the row */
  editor: (id: string, i: number, close: () => void) => ComponentChildren;
  /** the left end of the bottom line (the switch that shows or hides a service) */
  extra?: (id: string, i: number) => ComponentChildren;
  note: string;
}

/**
 * One row per item, the whole of it editable in place: a tap opens the row (a calm animation, the rows below glide down), a
 * tap again or on another row closes it. The same list for Paslaugos, Asmeniniai and Išlaidų rūšys.
 */
export function EditList({ prefix, items, addLabel, onAdd, onRename, onMove, onDelete, editor, extra, note }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null); // the item just added: its row opens and its name gets the cursor
  const body = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || !items.some((x) => x.id === focusId)) return;
    pending.current = focusId; setOpen(focusId); setFocusId(null);
  }, [focusId, items]);
  useEffect(() => { // the new row has opened (it is no longer inert): the cursor goes into its name, selected
    if (!open || pending.current !== open) return;
    pending.current = null;
    const input = document.querySelector<HTMLInputElement>(`[data-testid="${prefix}-name-${items.findIndex((x) => x.id === open)}"]`);
    if (input) { input.focus({ preventScroll: true }); input.select(); }
  }, [open]);
  const toggle = (id: string) => {
    (document.activeElement as HTMLElement | null)?.blur(); // a tap on a row while the keyboard is up closes the keyboard and the row in one go
    setOpen((o) => (o === id ? null : id));
  };
  useEffect(() => { // an opened row is scrolled into view once it has grown
    if (!open) return;
    const h = window.setTimeout(() => body.current?.querySelector<HTMLElement>('.er.open')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 140);
    return () => clearTimeout(h);
  }, [open]);
  return (
    <div ref={body}>
      <div class="er-list">
        {items.map((it, i) => {
          const isOpen = open === it.id;
          return (
            <div key={it.id} class={`er${isOpen ? ' open' : ''}${it.off ? ' off' : ''}`} style={{ '--tint': it.tint } as CSSProperties} data-testid={`${prefix}-row-${i}`}>
              <button class="er-top" data-testid={`${prefix}-open-${i}`} aria-expanded={isOpen} onClick={() => toggle(it.id)}>
                {it.lead}
                <span class="er-name">{it.name}</span>
                <span class="er-val">{it.value}</span>
                <span class="er-chev" aria-hidden="true"><NextIcon /></span>
              </button>
              <div class="er-ed">
                <div class="er-ed-in" inert={!isOpen}>
                  <input class="er-input" data-testid={`${prefix}-name-${i}`} defaultValue={it.name} key={`${it.id}${it.name}${tick}`} autocomplete="off" autocapitalize="sentences" aria-label={t('edit.name')}
                    onChange={(e) => void onRename(it.id, (e.target as HTMLInputElement).value).then(() => setTick((x) => x + 1))} />
                  {editor(it.id, i, () => setOpen(null))}
                  <div class="er-foot">
                    {extra?.(it.id, i)}
                    <span class="er-spacer" />
                    <button class="sq up" data-testid={`${prefix}-up-${i}`} aria-label={t('edit.up')} disabled={i === 0} onClick={() => onMove(it.id, -1)}><ChevronIcon /></button>
                    <button class="sq" data-testid={`${prefix}-down-${i}`} aria-label={t('edit.down')} disabled={i === items.length - 1} onClick={() => onMove(it.id, 1)}><ChevronIcon /></button>
                    <button class="sq red" data-testid={`${prefix}-delete-${i}`} aria-label={t('btn.delete')} onClick={() => onDelete(it.id)}><TrashIcon /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button class="er-add" data-testid={`${prefix}-add`} onClick={() => { primeKeyboard(); void onAdd().then(setFocusId); }}><PlusIcon />{addLabel}</button>
      <p class="section-foot">{note}</p>
    </div>
  );
}

/** A switch like iOS's. */
export function Switch({ on, label, testId, onChange }: { on: boolean; label: string; testId: string; onChange: (on: boolean) => void }) {
  return <button class={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label={label} data-testid={testId} onClick={() => onChange(!on)}><span class="knob" /></button>;
}
