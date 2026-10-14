import { useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatDayShort, formatEuro, formatWhen } from '../../i18n/format';
import { confirmDeleteClient, openCancelled } from '../actions';
import { SwipeRow } from '../components/SwipeRow';
import { t } from '../../i18n/lt';
import { foldName } from '../../logic/names';
import { useLive } from '../hooks';
import { NextIcon, SearchIcon } from '../icons';
import { openAmount } from '../amount';
import { ui } from '../store';

/** Monogram for a client: the first letters of the first two words. */
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export function ClientsScreen() {
  const [q, setQ] = useState('');
  const list = useLive(() => repo.listClients(), [], []);
  const cancelled = useLive(() => repo.cancelledEntries(), [], []);
  const key = foldName(q);
  const rows = key ? list.filter((r) => r.client.nameKey.includes(key)) : list;
  const cancelledRows = key ? cancelled.filter((e) => foldName(e.label).includes(key)) : cancelled;
  return (
    <section class="list-screen" data-testid="clients">
      <header class="chrome">
        <h1 class="large-title top">{t('tab.clients')}</h1>
        <label class="searchbar">
          <SearchIcon />
          <input type="search" data-testid="client-search" placeholder={t('clients.search')} value={q} autocomplete="off"
            onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </label>
      </header>
      <div class="scroll list-body">
        {list.length === 0 && <p class="empty-note" data-testid="clients-empty">{t('clients.empty')}</p>}
        {rows.length > 0 && (
          <ul class="group client-list">
            {rows.map((r, i) => (
              <li key={r.client.id}>
                <SwipeRow testId={`client-swipe-${i}`} onDelete={() => void confirmDeleteClient(r.client.id, r.client.name)}>
                <button class="client-row" data-testid={`client-row-${i}`} onClick={() => ui.set({ client: r.client.id })}>
                  <span class="avatar" aria-hidden="true">{initials(r.client.name)}</span>
                  <span class="client-text">
                    <b>{r.client.name}</b>
                    <span class="client-status">
                      {r.pending && (
                        <span class="pill due tap" role="button" tabIndex={0} data-testid={`client-pending-${i}`}
                          onClick={(e) => { e.stopPropagation(); openAmount(r.pending!.id); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openAmount(r.pending!.id); } }}>{t('client.pending')}</span>
                      )}
                      {r.paidCents > 0 && <span class="pill paid" data-testid={`client-paid-${i}`}>✓ {t('client.paid', { suma: formatEuro(r.paidCents) })}</span>}
                      {r.nextVisit && <span class="next" data-testid={`client-next-${i}`}>{t('client.next', { kada: formatWhen(r.nextVisit) })}</span>}
                      {!r.pending && r.paidCents === 0 && !r.nextVisit && r.lastVisit && <span>{t('client.lastVisit', { data: formatDayShort(r.lastVisit) })}</span>}
                    </span>
                  </span>
                  <span class="chev"><NextIcon /></span>
                </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        )}
        {cancelledRows.length > 0 && (
          <>
            <h2 class="section-head" data-testid="cancelled-head">{t('clients.cancelledHead')}</h2>
            <ul class="group client-list">
              {cancelledRows.map((e, i) => (
                <li key={e.appt.id}>
                  <button class="client-row cancelled-row" data-testid={`cancelled-row-${i}`} onClick={() => openCancelled(e)}>
                    <span class="avatar dim" aria-hidden="true">{initials(e.label)}</span>
                    <span class="client-text">
                      <b>{e.label}</b>
                      <span class="client-status"><span class="pill gone">{t('status.cancelled')}</span><span class="next">{formatWhen(e.appt.start)}</span></span>
                    </span>
                    <span class="chev"><NextIcon /></span>
                  </button>
                </li>
              ))}
            </ul>
            <p class="section-foot">{t('clients.cancelledFoot')}</p>
          </>
        )}
      </div>
    </section>
  );
}
