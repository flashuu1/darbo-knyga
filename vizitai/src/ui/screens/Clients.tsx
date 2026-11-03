import { useMemo, useRef, useState } from 'preact/hooks';
import { repo, type ClientRow } from '../../db/repo';
import { formatDayCompact, formatDayShort, formatEuroRound, formatEuroShort } from '../../i18n/format';
import { confirmDeleteClient, openCancelled } from '../actions';
import { SwipeRow } from '../components/SwipeRow';
import { t } from '../../i18n/lt';
import { agoParts } from '../../logic/analytics';
import { applyClients, filterTest, TILE_FILTERS, type ClientFilter } from '../../logic/clientlist';
import { datePart, nowLocal } from '../../logic/time';
import { formatWhen } from '../../i18n/format';
import { useLive } from '../hooks';
import { FilterIcon, NextIcon, PlusIcon, SearchIcon } from '../icons';
import { openAmount } from '../amount';
import { ui, useStore } from '../store';
import { clientsUi } from '../clientsUi';

/** Monogram for a client: the first letters of the first two words. */
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export const FILTER_LABEL: Record<ClientFilter, () => string> = {
  auto: () => t('cl.f.auto'), due: () => t('cl.tile.due'), week: () => t('cl.tile.week'), old: () => t('cl.tile.old'), recent: () => t('cl.tile.recent'),
};
export const agoText = (date: string | null, now: string) => {
  const a = agoParts(date, now);
  return !a ? t('cl.noVisits') : a.key === 'today' ? t('cl.ago.today') : a.key === 'yesterday' ? t('cl.ago.yesterday') : t(`cl.ago.${a.key}` as 'cl.ago.days', { n: a.n });
};

export function ClientsScreen() {
  const { filter, sort } = useStore(clientsUi);
  const [q, setQ] = useState('');
  const now = nowLocal();
  const all = useLive(() => repo.listClients(), [], [] as ClientRow[]);
  const cancelled = useLive(() => repo.cancelledEntries(), [], []);
  const rows = useMemo(() => applyClients(all, filter, sort, q, now), [all, filter, sort, q, datePart(now)]);
  const changed = (filter !== 'auto' ? 1 : 0) + (sort !== 'auto' ? 1 : 0);
  const key = q.trim().toLowerCase();
  const cancelledRows = filter === 'auto' && sort === 'auto' ? (key ? cancelled.filter((e) => e.label.toLowerCase().includes(key)) : cancelled) : [];
  return (
    <section class="list-screen clients" data-testid="clients">
      <header class="chrome">
        <div class="titlebar">
          <h1 class="large-title top">{t('tab.clients')}</h1>
          <button class="add-btn press" data-testid="client-add" aria-label={t('cl.addAria')} onClick={() => ui.set({ sheet: { type: 'cnew' } })}><PlusIcon /></button>
        </div>
        <div class="searchrow">
          <label class="searchbar">
            <SearchIcon />
            <input type="search" data-testid="client-search" placeholder={t('cl.search')} value={q} autocomplete="off"
              onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          </label>
          <button class={changed ? 'filter-btn on press' : 'filter-btn press'} data-testid="client-filter" aria-label={t('cl.filterAria')} onClick={() => ui.set({ sheet: { type: 'cfilter' } })}>
            <FilterIcon /><span class="filter-dot" data-testid="filter-count">{changed}</span>
          </button>
        </div>
      </header>
        <div class="scroll list-body">
          {all.length === 0 && <p class="empty-note" data-testid="clients-empty">{t('clients.empty')}</p>}
          {all.length > 0 && (
            <div class="tiles" data-testid="tiles">
              {TILE_FILTERS.map((f) => {
                const list = all.filter((r) => filterTest(f, r, now));
                const sub = f === 'week' ? (list.length ? t('cl.sub.week', { kada: formatDayShort(list.map((r) => r.nextVisit!).sort()[0]!) }) : '') : t(`cl.sub.${f}` as 'cl.sub.due');
                return (
                  <button key={f} class={`tile ${f}${filter === f ? ' on' : ''}`} data-testid={`tile-${f}`} onClick={() => clientsUi.set({ filter: filter === f ? 'auto' : f })}>
                    <span class="num">{list.length}</span><span class="lab">{FILTER_LABEL[f]()}</span><span class="sub">{sub}</span>
                  </button>
                );
              })}
            </div>
          )}
          {all.length > 0 && (
            <div class="listhead" data-testid="list-head">
              <span>{filter === 'auto' ? t('cl.head.all') : FILTER_LABEL[filter]()} · {rows.length}</span>
              {filter !== 'auto' && <button data-testid="show-all" onClick={() => clientsUi.set({ filter: 'auto' })}>{t('cl.head.showAll')}</button>}
            </div>
          )}
          {all.length > 0 && rows.length === 0 && <p class="empty-note" data-testid="clients-none">{filter === 'due' && !q ? t('cl.dueAllDone') : t('cl.none')}</p>}
          {rows.length > 0 && (
            <ul class="group client-list anim" key={`${filter}-${sort}`}>
              {rows.map((r, i) => (
                <li key={r.client.id} style={{ '--i': Math.min(i, 8) }}>
                  <SwipeRow testId={`client-swipe-${i}`} onDelete={() => void confirmDeleteClient(r.client.id, r.client.name)}>
                    <ClientRowView r={r} i={i} sort={sort} now={now} />
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

const HOLD_SHOW_MS = 450; // how long a row is held before its visit opens
function ClientRowView({ r, i, sort, now }: { r: ClientRow; i: number; sort: string; now: string }) {
  const line = sort === 'spent' ? t('cl.totalLine', { suma: formatEuroRound(r.spentCents), n: r.visitCount })
    : sort === 'visits' ? t('cl.visitsLine', { n: r.visitCount, ago: agoText(r.lastVisit, now) })
    : r.pending ? t('cl.visitOn', { data: formatDayShort(r.pending.start) })
    : r.nextVisit ? t('cl.nextShort', { kada: formatDayShort(r.nextVisit) })
    : agoText(r.lastVisit, now);
  // Press and hold floats a small card over the list about the visit the line talks about (the one waiting for its amount,
  // the next one, the one paid for, or the last one); a tap still opens the client.
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);
  const entryId = r.pending?.id ?? r.nextId ?? r.paid?.id ?? r.lastId;
  const cancelHold = () => { if (hold.current) { clearTimeout(hold.current.timer); hold.current = null; } };
  const startHold = (e: PointerEvent) => {
    cancelHold();
    held.current = false;
    if (!entryId || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const row = e.currentTarget as HTMLElement;
    row.classList.add('holding');
    hold.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => { hold.current = null; held.current = true; row.classList.remove('holding'); const b = row.getBoundingClientRect(); ui.set({ peek: { id: entryId, top: b.top, height: b.height } }); }, HOLD_SHOW_MS) };
  };
  const moveHold = (e: PointerEvent) => { const h = hold.current; if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) { cancelHold(); (e.currentTarget as HTMLElement).classList.remove('holding'); } };
  const endHold = (e: PointerEvent) => { cancelHold(); (e.currentTarget as HTMLElement).classList.remove('holding'); };
  return (
    <button class="client-row" data-testid={`client-row-${i}`} onPointerDown={startHold} onPointerMove={moveHold} onPointerUp={endHold} onPointerCancel={endHold} onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (held.current) { held.current = false; return; } ui.set({ client: r.client.id }); }}>
      <span class="avatar" aria-hidden="true">{initials(r.client.name)}</span>
      <span class="client-text">
        <b>{r.client.name}</b>
        <span class={r.nextVisit && !r.pending && sort !== 'spent' && sort !== 'visits' ? 'client-line next' : 'client-line'} data-testid={r.nextVisit ? `client-next-${i}` : undefined}>{line}</span>
      </span>
      {r.pending ? (
        <span class="pill-btn due" role="button" tabIndex={0} data-testid={`client-pending-${i}`}
          onClick={(e) => { e.stopPropagation(); if (held.current) { held.current = false; return; } openAmount(r.pending!.id); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openAmount(r.pending!.id); } }}>{t('client.pending')}</span>
      ) : r.paid ? (
        <span class="pill-btn paid" role="button" tabIndex={0} data-testid={`client-paid-${i}`}
          onClick={(e) => { e.stopPropagation(); if (held.current) { held.current = false; return; } openAmount(r.paid!.id); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openAmount(r.paid!.id); } }}>✓ {t('cl.paidPill', { suma: formatEuroShort(r.paid.cents), data: formatDayCompact(r.paid.start) })}</span>
      ) : (
        <span class="chev"><NextIcon /></span>
      )}
    </button>
  );
}

