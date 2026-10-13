import { useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import type { OptionGroup } from '../../db/types';
import { t } from '../../i18n/lt';
import { confirmDeleteOption } from '../actions';
import { useOptions } from '../hooks';
import { SwipeRow } from './SwipeRow';

/** Her own choices in Settings: the kinds of personal entry, or the kinds of expense. Rename in place, swipe left to delete. */
export function OptionList({ group }: { group: OptionGroup }) {
  const options = useOptions(group);
  const [tick, setTick] = useState(0);
  const rename = async (id: string, name: string) => {
    try { await repo.renameOption(id, name); } catch (e) { console.error(e); }
    setTick((x) => x + 1); // show the stored name again (a blank edit is ignored)
  };
  return (
    <>
      {options.length > 0 && (
        <ul class="group svc-list">
          {options.map((o, i) => (
            <li key={o.id} data-testid={`opt-${group}-row-${i}`}>
              <SwipeRow testId={`opt-${group}-swipe-${i}`} onDelete={() => confirmDeleteOption(o)}>
                <div class="svc-line">
                  <input class="inline left" data-testid={`opt-${group}-name-${i}`} defaultValue={o.name} key={`${o.id}${o.name}${tick}`} autocomplete="off" aria-label={t('option.field')}
                    onChange={(e) => void rename(o.id, (e.target as HTMLInputElement).value)} />
                </div>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
      <div class="group">
        <button class="group-row accent" data-testid={`opt-${group}-add`} onClick={() => void repo.addOption(group, t('option.new'))}>{t('option.add')}</button>
      </div>
    </>
  );
}
