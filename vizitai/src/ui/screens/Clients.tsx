import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { repo, type ClientRow } from '../../db/repo';
import { formatDayShort, formatEuro, formatEuroRound } from '../../i18n/format';
import { confirmDeleteClient, openCancelled } from '../actions';
import { SwipeRow } from '../components/SwipeRow';
import { Segmented } from '../components/Segmented';
import { t } from '../../i18n/lt';
import { agoParts } from '../../logic/analytics';
import { applyClients, filterTest, TILE_FILTERS, type ClientFilter } from '../../logic/clientlist';
import { datePart, nowLocal } from '../../logic/time';
import { formatWhen } from '../../i18n/format';
import { useLive } from '../hooks';
import { FilterIcon, NextIcon, PlusIcon, SearchIcon } from '../icons';
import { openAmount } from '../amount';
import { ui, useStore } from '../store';
import { clientsUi, goPage, pageIndex, slideClass } from '../clientsUi';
import { ClientStats } from './ClientStats';

/** Monogram for a client: the first letters of the first two words. */
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export const FILTER_LABEL: Record<ClientFilter, () => string> = {
  auto: () => t('cl.f.auto'), due: () => t('cl.tile.due'), week: () => t('cl.tile.week'), old: () => t('cl.tile.old'), recent: () => t('cl.tile.recent'),
};
const agoText = (date: string | null, now: string) => {
  const a = agoParts(date, now);
  return !a ? t('cl.noVisits') : a.key === 'today' ? t('cl.ago.today') : a.key === 'yesterday' ? t('cl.ago.yesterday') : t(`cl.ago.${a.key}` as 'cl.ago.days', { n: a.n });
};

export function ClientsScreen() {
  const { view, filter, sort, dir } = useStore(clientsUi);
  const root = useRef<HTMLElement>(null);
  usePager(root);
  const [q, setQ] = useState('');
  const now = nowLocal();
  const all = useLive(() => repo.listClients(), [], [] as ClientRow[]);
  const cancelled = useLive(() => repo.cancelledEntries(), [], []);
  const rows = useMemo(() => applyClients(all, filter, sort, q, now), [all, filter, sort, q, datePart(now)]);
  const changed = (filter !== 'auto' ? 1 : 0) + (sort !== 'auto' ? 1 : 0);
  const key = q.trim().toLowerCase();
  const cancelledRows = filter === 'auto' && sort === 'auto' ? (key ? cancelled.filter((e) => e.label.toLowerCase().includes(key)) : cancelled) : [];
  const stats = view === 'stats';
  return (
    <section ref={root} class="list-screen clients" data-testid="clients">
      <header class="chrome">
        <div class="titlebar">
          <h1 class="large-title top">{t('tab.clients')}</h1>
          <button class="add-btn press" data-testid="client-add" aria-label={t('cl.addAria')} onClick={() => ui.set({ sheet: { type: 'cnew' } })}><PlusIcon /></button>
        </div>
        <Segmented testId="clients-seg" value={view} onChange={(v) => goPage(v === 'list' ? 0 : Math.max(1, pageIndex({ view: 'stats', stat: clientsUi.get().stat })))}
          items={[{ id: 'list', label: t('cl.seg.list') }, { id: 'stats', label: t('cl.seg.stats') }]} />
        {!stats && (
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
        )}
      </header>
      {stats ? <ClientStats /> : (
        <div class={`scroll list-body ${slideClass(dir)}`}>
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
      )}
    </section>
  );
}

function ClientRowView({ r, i, sort, now }: { r: ClientRow; i: number; sort: string; now: string }) {
  const line = sort === 'spent' ? t('cl.totalLine', { suma: formatEuroRound(r.spentCents), n: r.visitCount })
    : sort === 'visits' ? t('cl.visitsLine', { n: r.visitCount, ago: agoText(r.lastVisit, now) })
    : r.pending ? t('cl.visitOn', { data: formatDayShort(r.pending.start) })
    : r.nextVisit ? t('cl.nextShort', { kada: formatDayShort(r.nextVisit) })
    : agoText(r.lastVisit, now);
  return (
    <button class="client-row" data-testid={`client-row-${i}`} onClick={() => ui.set({ client: r.client.id })}>
      <span class="avatar" aria-hidden="true">{initials(r.client.name)}</span>
      <span class="client-text">
        <b>{r.client.name}</b>
        <span class={r.nextVisit && !r.pending && sort !== 'spent' && sort !== 'visits' ? 'client-line next' : 'client-line'} data-testid={r.nextVisit ? `client-next-${i}` : undefined}>{line}</span>
      </span>
      {r.pending ? (
        <span class="pill-btn due" role="button" tabIndex={0} data-testid={`client-pending-${i}`}
          onClick={(e) => { e.stopPropagation(); openAmount(r.pending!.id); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openAmount(r.pending!.id); } }}>{t('client.pending')}</span>
      ) : r.paid ? (
        <span class="pill-btn paid" role="button" tabIndex={0} data-testid={`client-paid-${i}`}
          onClick={(e) => { e.stopPropagation(); openAmount(r.paid!.id); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openAmount(r.paid!.id); } }}>✓ {t('cl.paidPill', { suma: formatEuro(r.paid.cents), data: formatDayShort(r.paid.start) })}</span>
      ) : (
        <span class="chev"><NextIcon /></span>
      )}
    </button>
  );
}

const NO_PAGE_SWIPE = '.lc, .ov, .swipe-row, input, textarea, .glass, [data-no-page-swipe]'; // things that use a sideways drag themselves
/**
 * A sideways swipe on the Klientai tab turns the page: Sąrašas, then the four pages of Analizė, and back. Charts, the
 * period bar and the rows (swipe left = delete) keep their own drags. A page turn eats the click that would follow.
 */
function usePager(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let g: { id: number; x0: number; y0: number; t0: number; state: 'maybe' | 'yes' } | null = null;
    const down = (e: PointerEvent) => {
      g = null;
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || (e.target as HTMLElement).closest(NO_PAGE_SWIPE)) return;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), state: 'maybe' };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.state === 'yes') return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) g = null; // she is scrolling
      else if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.5) g.state = 'yes';
    };
    const up = (e: PointerEvent) => {
      const s = g;
      g = null;
      if (!s || e.pointerId !== s.id || s.state !== 'yes') return;
      const dx = e.clientX - s.x0, fast = Math.abs(dx) / Math.max(1, performance.now() - s.t0) > 0.5;
      if (Math.abs(dx) < (fast ? 36 : 64)) return;
      goPage(pageIndex(clientsUi.get()) + (dx < 0 ? 1 : -1));
      const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      el.addEventListener('click', eat, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', eat, true), 120);
    };
    const cancel = () => { g = null; };
    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', cancel, { passive: true });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
  }, []);
}
