import { useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatDayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { foldName } from '../../logic/names';
import { useLive } from '../hooks';
import { ui } from '../store';

export function ClientsScreen() {
  const [q, setQ] = useState('');
  const list = useLive(() => repo.listClients(), [], []);
  const key = foldName(q);
  const rows = key ? list.filter((r) => r.client.nameKey.includes(key)) : list;
  return (
    <section class="clients" data-testid="clients">
      <h1 class="large-title">{t('tab.clients')}</h1>
      <div class="searchbar"><input type="search" data-testid="client-search" placeholder={t('clients.search')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /></div>
      {list.length === 0 && <p class="empty-note" data-testid="clients-empty">{t('clients.empty')}</p>}
      <ul class="client-list">
        {rows.map((r, i) => (
          <li key={r.client.id}>
            <button data-testid={`client-row-${i}`} onClick={() => ui.set({ client: r.client.id })}>
              <b>{r.client.name}</b>
              {r.lastVisit && <span>{t('client.lastVisit', { data: formatDayShort(r.lastVisit) })}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
