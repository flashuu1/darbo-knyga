import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import type { Option, OptionGroup } from '../../db/types';
import { formatAmountInput, formatEuroShort, parseAmountInput, euroSign } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { confirmDeleteOption, primeKeyboard } from '../actions';
import { useOptions } from '../hooks';
import { ClockIcon, WalletIcon } from '../icons';
import { Dur, DurationEditor, EditList, Switch } from './EditList';

/**
 * Her own choices in Settings: the kinds of personal entry (with a length) or the kinds of expense (with an optional fixed
 * amount). The same rows as Paslaugos: a tap opens a row, everything is changed in place.
 */
export function OptionList({ group }: { group: OptionGroup }) {
  const options = useOptions(group);
  const by = (id: string) => options.find((o) => o.id === id)!;
  const personal = group === 'personal';
  const prefix = `opt-${group}`;
  return (
    <EditList prefix={prefix} addLabel={t(personal ? 'option.addPersonal' : 'option.addExpense')} note={t(personal ? 'option.personalNote' : 'option.expenseNote')}
      items={options.map((o) => ({
        id: o.id, name: o.name, tint: personal ? 'var(--c-gray)' : 'var(--c-indigo)',
        lead: <span class="er-ic" aria-hidden="true">{personal ? <ClockIcon /> : <WalletIcon />}</span>,
        value: personal ? <Dur m={o.minutes ?? 30} /> : o.costCents != null ? formatEuroShort(o.costCents) : <span class="er-none">{t('cost.none')}</span>,
      }))}
      onAdd={async () => (await repo.addOption(group, t('option.new'))).id}
      onRename={async (id, name) => { try { await repo.renameOption(id, name); } catch (e) { console.error(e); } }}
      onMove={(id, dir) => void repo.moveOption(id, dir)}
      onDelete={(id) => confirmDeleteOption(by(id))}
      editor={(id, i, close) => personal
        ? <DurationEditor prefix={prefix} i={i} minutes={by(id).minutes ?? 30} max={720} onChange={(m) => void repo.updateOption(id, { minutes: m })} />
        : <CostEditor key={id} o={by(id)} i={i} close={close} />} />
  );
}

/**
 * Išlaidų rūšys: "Fiksuota suma". Off (the start): nothing is assumed when she enters that kind of expense. On: the new-entry
 * screen starts with this amount, and she confirms or changes it. Turning it on slides the amount field open and brings up the
 * number pad at once. Emptying the field means she does not want one: the switch goes off, the keyboard goes away and the row folds.
 */
function CostEditor({ o, i, close }: { o: Option; i: number; close: () => void }) {
  const [on, setOn] = useState(o.costCents != null);
  const [text, setText] = useState(o.costCents != null ? formatAmountInput(o.costCents) : '');
  const input = useRef<HTMLInputElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (on && focusNext.current) { focusNext.current = false; input.current?.focus({ preventScroll: true }); } // from the keyboard primer to the field: the pad stays up
  }, [on]);
  const turnOn = () => { primeKeyboard('decimal'); focusNext.current = true; setOn(true); };
  const turnOff = (fold: boolean) => {
    input.current?.blur();
    setOn(false); setText('');
    void repo.updateOption(o.id, { costCents: null });
    if (fold) window.setTimeout(close, 180); // the field slides away first, then the whole row folds
  };
  const edit = (v: string) => {
    setText(v);
    if (v.trim() === '') { turnOff(true); return; }
    const c = parseAmountInput(v);
    if (c !== null && c > 0) void repo.updateOption(o.id, { costCents: c });
  };
  return (
    <div class={on ? 'cost on' : 'cost'}>
      <div class="cost-top">
        <div class="cost-text"><b>{t('cost.title')}</b><span>{on ? t('cost.onNote') : t('cost.offNote')}</span></div>
        <Switch on={on} label={t('cost.title')} testId={`opt-expense-cost-toggle-${i}`} onChange={(v) => (v ? turnOn() : turnOff(false))} />
      </div>
      <div class="cost-in" style={{ '--n': 1 } as CSSProperties}>
        <div>
          <label class="amt">
            <input ref={input} data-testid={`opt-expense-cost-${i}`} inputMode="decimal" enterKeyHint="done" autocomplete="off" placeholder="0" aria-label={t('cost.title')} value={text} tabIndex={on ? 0 : -1}
              onInput={(e) => edit((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
              onBlur={() => { const c = parseAmountInput(text); if (on && (c === null || c === 0)) turnOff(false); }} />
            <span aria-hidden="true">{euroSign}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
