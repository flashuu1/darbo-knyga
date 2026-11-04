import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import type { Option, OptionGroup } from '../../db/types';
import { formatAmountInput, formatEuroShort, parseAmountInput, euroSign } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { primeKeyboard, removeOption } from '../actions';
import { useOptions } from '../hooks';
import { ClockIcon, WalletIcon } from '../icons';
import { Dur, DurationEditor, EditList, Switch, useRows } from './EditList';

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
      onReorder={(ids) => repo.reorderOptions(group, ids)}
      onRemove={(id) => removeOption(by(id))}
      editor={(id, i) => personal
        ? <DurationEditor prefix={prefix} i={i} minutes={by(id).minutes ?? 30} max={720} onChange={(m) => void repo.updateOption(id, { minutes: m })} />
        : <CostEditor key={id} o={by(id)} i={i} />} />
  );
}

/**
 * Išlaidų rūšys: "Fiksuota suma". Off (the start): nothing is assumed when she enters that kind of expense. On: the new-entry
 * screen starts with this amount, and she confirms or changes it. Turning it on opens the amount field (the row grows, the rows
 * below glide down) and brings up the number pad in the same moment. Emptying the field means she does not want one: the
 * keyboard goes down and the row folds. The switch can be pressed at any time, also with the number pad up.
 */
function CostEditor({ o, i }: { o: Option; i: number }) {
  const { flip, fold } = useRows();
  const [on, setOn] = useState(o.costCents != null);
  const [text, setText] = useState(o.costCents != null ? formatAmountInput(o.costCents) : '');
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const block = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  const pressing = useRef(0); // a press on the switch or on "Gerai" is under way: leaving the field is not "she walked away"
  useEffect(() => {
    if (on && focusNext.current) { focusNext.current = false; input.current?.focus({ preventScroll: true }); } // from the keyboard primer to the field: the pad stays up
  }, [on]);
  const press = () => { pressing.current = Date.now(); };
  const turnOn = () => {
    primeKeyboard('decimal'); focusNext.current = true;
    flip(() => setOn(true), { reveal: () => block.current, kb: 300 }); // the field opens and the pad rises together
  };
  const turnOff = () => {
    input.current?.blur();
    flip(() => { setOn(false); setText(''); });
    void repo.updateOption(o.id, { costCents: null });
  };
  const edit = (v: string) => {
    setText(v);
    if (v.trim() === '') { // she emptied it: no fixed amount, and she is done here
      input.current?.blur(); void repo.updateOption(o.id, { costCents: null }); fold();
      return;
    }
    const c = parseAmountInput(v);
    if (c !== null && c > 0) void repo.updateOption(o.id, { costCents: c });
  };
  const left = () => {
    setFocused(false);
    if (Date.now() - pressing.current < 700) return; // she is pressing the switch (or Gerai): that press decides
    const c = parseAmountInput(text);
    if (on && (c === null || c === 0)) turnOff();
  };
  return (
    <div class={on ? 'cost on' : 'cost'} ref={block}>
      <div class="cost-top" onPointerDown={press}>
        <div class="cost-text"><b>{t('cost.title')}</b><span>{on ? t('cost.onNote') : t('cost.offNote')}</span></div>
        <Switch on={on} label={t('cost.title')} testId={`opt-expense-cost-toggle-${i}`} onChange={(v) => { pressing.current = 0; if (v) turnOn(); else turnOff(); }} />
      </div>
      {on && (
        <div class="amt">
          <input ref={input} data-testid={`opt-expense-cost-${i}`} inputMode="decimal" autocomplete="off" placeholder="0" aria-label={t('cost.title')} value={text}
            onInput={(e) => edit((e.target as HTMLInputElement).value)} onFocus={() => setFocused(true)} onBlur={left} />
          <span class="amt-eur" aria-hidden="true">{euroSign}</span>
          <button class={focused ? 'amt-done on' : 'amt-done'} data-testid={`opt-expense-cost-done-${i}`} tabIndex={focused ? 0 : -1} onPointerDown={press} onClick={(e) => { e.preventDefault(); pressing.current = 0; input.current?.blur(); }}>{t('cost.done')}</button>
        </div>
      )}
    </div>
  );
}
