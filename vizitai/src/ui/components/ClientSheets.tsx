import { saveFailed } from '../failure';
import { useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { t } from '../../i18n/lt';
import { countFor, FILTERS, SORTS, type ClientFilter, type ClientSort } from '../../logic/clientlist';
import { foldName } from '../../logic/names';
import { nowLocal } from '../../logic/time';
import { closeSheet, showToast } from '../actions';
import { clientsUi } from '../clientsUi';
import { useLive } from '../hooks';
import { CheckIcon } from '../icons';
import { FILTER_LABEL } from '../screens/Clients';
import { useStore } from '../store';
import { Sheet } from './Sheet';

const SORT_LABEL: Record<ClientSort, () => string> = {
  auto: () => t('cl.s.auto'), az: () => t('cl.s.az'), last: () => t('cl.s.last'), spent: () => t('cl.s.spent'), visits: () => t('cl.s.visits'),
};

/** "Filtruoti ir rūšiuoti": what the list shows (with counts) and how it is ordered. */
export function ClientFilterSheet() {
  const { filter, sort } = useStore(clientsUi);
  const rows = useLive(() => repo.listClients(), [], []);
  const now = nowLocal();
  const pick = (p: Partial<{ filter: ClientFilter; sort: ClientSort }>) => { clientsUi.set(p); closeSheet(); };
  return (
    <Sheet title={t('cl.filter.title')} onClose={closeSheet} testId="filter-sheet" right={<button class="strong" onClick={closeSheet}>{t('btn.close')}</button>}>
      <h3 class="sheet-label">{t('cl.filter.show')}</h3>
      <div class="actions-list pick-list">
        {FILTERS.map((f) => (
          <button key={f} class={filter === f ? 'pick on' : 'pick'} data-testid={`filter-${f}`} onClick={() => pick({ filter: f })}>
            <span class="tick">{filter === f && <CheckIcon />}</span>
            <span class="grow">{FILTER_LABEL[f]()}{f === 'auto' && <small> · {t('cl.f.autoHint')}</small>}</span>
            <span class="cnt">{countFor(rows, f, now)}</span>
          </button>
        ))}
      </div>
      <h3 class="sheet-label">{t('cl.filter.sort')}</h3>
      <div class="actions-list pick-list">
        {SORTS.map((s) => (
          <button key={s} class={sort === s ? 'pick on' : 'pick'} data-testid={`sort-${s}`} onClick={() => pick({ sort: s })}>
            <span class="tick">{sort === s && <CheckIcon />}</span>
            <span class="grow">{SORT_LABEL[s]()}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** A client without a visit: name and (optional) phone. */
export function NewClientSheet() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const busy = useRef(false);
  const ok = name.trim().length > 0;
  async function save() {
    if (!ok || busy.current) return;
    busy.current = true;
    try {
      const existed = (await repo.listClients()).some((r) => r.client.nameKey === foldName(name));
      const c = await repo.matchOrCreateClient(name);
      if (phone.trim()) await repo.updateClient(c.id, { phone });
      closeSheet();
      showToast(existed ? t('cl.addExists') : t('cl.added'));
    } catch (e) {
      busy.current = false;
      saveFailed(e, save);
    }
  }
  return (
    <Sheet title={t('cl.add')} variant="dialog" onClose={closeSheet} testId="new-client-sheet" left={<button data-testid="btn-dismiss" onClick={closeSheet}>{t('btn.dismiss')}</button>}
      right={<button class="strong" data-testid="new-client-save" disabled={!ok} onClick={() => void save()}>{t('cl.addSave')}</button>}>
      <input class="field" data-testid="new-client-name" placeholder={t('cl.addName')} value={name} autocomplete="off" autoFocus
        onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
      <input class="field" data-testid="new-client-phone" type="tel" inputMode="tel" placeholder={t('cl.addPhone')} value={phone} autocomplete="off"
        onInput={(e) => setPhone((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
    </Sheet>
  );
}
