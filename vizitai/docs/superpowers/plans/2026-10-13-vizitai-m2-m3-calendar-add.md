# M2 + M3 – Calendar and add flow

Read the index first. Branches: `m2-calendar`, then `m3-add-flow` (each from updated `main`, one PR each). Commands run in `vizitai/`.

Shared UI foundations (store, hooks, actions) are created in Task 8 and reused afterwards.

## M2 – Calendar views

**Done when:** entries render at the correct times and empty rows are tappable.

### Task 8: Store, hooks, layout logic, Day view, week strip

**Files:**
- Create: `src/logic/layout.ts`, `src/ui/store.ts`, `src/ui/hooks.ts`, `src/ui/actions.ts`, `src/ui/screens/Calendar.tsx`, `src/ui/components/WeekStrip.tsx`, `src/ui/components/TimelineGrid.tsx`, `src/ui/components/EntryBlock.tsx`, `src/ui/components/Sheets.tsx`, `tests/e2e/helpers.ts`, `tests/e2e/calendar.spec.ts`
- Modify: `src/app.tsx`, `src/ui/components/TabBar.tsx`, `src/main.tsx`, `src/styles.css`
- Test: `tests/unit/layout.test.ts`

**Interfaces:**
- Produces (`layout.ts`):
```ts
layoutColumns(blocks: { id: string; start: number; end: number }[]): Map<string, { col: number; cols: number }>
visibleRange(s: { dayStart: string; dayEnd: string }, entries: { appt: { start: string }; minutes: number }[]): { startMin: number; endMin: number }  // multiples of 60, within 0..1440
```
- Produces (`store.ts`):
```ts
createStore<T>(initial: T): { get(): T; set(p: Partial<T>): void; subscribe(l: () => void): () => void }
useStore<T>(s: Store<T>): T
type Sheet = { type: 'new'; start: string; clientId?: string; serviceId?: string } | { type: 'appt'; id: string }
interface ToastState { id: number; text: string; undo?: () => Promise<void> }
interface DragState { entry: Entry; label: string; x: number; y: number; grabDY: number; left: number; width: number; over: { date: string; start: string } | null }
interface ActionItem { label: string; role?: 'destructive' | 'cancel'; onPress: () => void }
interface UiState { tab: Tab; view: 'day' | 'week' | 'month'; date: string; sheet: Sheet | null; client: string | null; toast: ToastState | null; highlight: string | null; drag: DragState | null; action: { title?: string; items: ActionItem[] } | null }
export const ui: Store<UiState>
isBusy(): boolean   // sheet, action sheet or client card open
```
- Produces (`hooks.ts`): `useLive<T>(q: () => T | Promise<T>, deps: unknown[], initial: T): T`; `useSettings(): Settings`; `useServices(activeOnly?: boolean): Service[]`.
- Produces (`actions.ts`): `openNew(start: string, extra?: { clientId?: string; serviceId?: string }): void`, `openNewToday(): Promise<void>` (uses `repo.defaultStartFor(ui.date)`), `openAppt(id: string): void`, `closeSheet(): void`, `showToast(text: string, undo?: () => Promise<void>): void`, `highlight(id: string): void`.

- [ ] **Step 1: Write failing unit tests** — `tests/unit/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { layoutColumns, visibleRange } from '../../src/logic/layout';

describe('layoutColumns', () => {
  it('gives non-overlapping blocks a single full-width column', () => {
    const m = layoutColumns([{ id: 'a', start: 600, end: 660 }, { id: 'b', start: 660, end: 720 }]);
    expect(m.get('a')).toEqual({ col: 0, cols: 1 });
    expect(m.get('b')).toEqual({ col: 0, cols: 1 });
  });
  it('places overlapping blocks side by side', () => {
    const m = layoutColumns([{ id: 'a', start: 600, end: 660 }, { id: 'b', start: 630, end: 690 }]);
    expect(m.get('a')).toEqual({ col: 0, cols: 2 });
    expect(m.get('b')).toEqual({ col: 1, cols: 2 });
  });
  it('reuses a free column inside a cluster', () => {
    const m = layoutColumns([
      { id: 'a', start: 600, end: 720 }, { id: 'b', start: 610, end: 630 }, { id: 'c', start: 640, end: 660 },
    ]);
    expect(m.get('c')).toEqual({ col: 1, cols: 2 });
  });
});

describe('visibleRange (bookings outside working hours stay visible)', () => {
  const hours = { dayStart: '08:00', dayEnd: '20:00' };
  it('uses working hours when entries fit', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T10:00' }, minutes: 60 }])).toEqual({ startMin: 480, endMin: 1200 });
  });
  it('grows earlier for an early booking', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T06:30' }, minutes: 60 }]).startMin).toBe(360);
  });
  it('grows later for a booking running past the end', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T19:45' }, minutes: 120 }]).endMin).toBe(1260);
  });
  it('clips at midnight', () => {
    expect(visibleRange(hours, [{ appt: { start: '2026-10-14T23:00' }, minutes: 180 }]).endMin).toBe(1440);
  });
});
```

- [ ] **Step 2: Run** `npm test -- layout` → FAIL.

- [ ] **Step 3: Implement `src/logic/layout.ts`**

```ts
export function layoutColumns(blocks: { id: string; start: number; end: number }[]): Map<string, { col: number; cols: number }> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: typeof sorted = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const colEnds: number[] = [];
    const assign = new Map<string, number>();
    for (const b of cluster) {
      let c = colEnds.findIndex((e) => e <= b.start);
      if (c < 0) { c = colEnds.length; colEnds.push(b.end); } else colEnds[c] = b.end;
      assign.set(b.id, c);
    }
    for (const b of cluster) out.set(b.id, { col: assign.get(b.id)!, cols: colEnds.length });
    cluster = [];
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = cluster.length === 1 ? b.end : Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

export function visibleRange(
  s: { dayStart: string; dayEnd: string },
  entries: { appt: { start: string }; minutes: number }[],
): { startMin: number; endMin: number } {
  let lo = toMin(s.dayStart), hi = toMin(s.dayEnd);
  for (const e of entries) {
    const m = toMin(e.appt.start.slice(11, 16));
    lo = Math.min(lo, m);
    hi = Math.max(hi, Math.min(m + e.minutes, 1440));
  }
  return { startMin: Math.floor(lo / 60) * 60, endMin: Math.min(1440, Math.ceil(hi / 60) * 60) };
}
```

- [ ] **Step 4: Run** `npm test -- layout` → PASS.

- [ ] **Step 5: Store, hooks, actions**

`src/ui/store.ts`:
```ts
import { useEffect, useState } from 'preact/hooks';
import type { Entry } from '../db/repo';
import { todayStr } from '../logic/time';
import type { Tab } from './components/TabBar';

export interface Store<T> { get(): T; set(p: Partial<T>): void; subscribe(l: () => void): () => void }
export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const ls = new Set<() => void>();
  return {
    get: () => state,
    set: (p) => { state = { ...state, ...p }; ls.forEach((l) => l()); },
    subscribe: (l) => { ls.add(l); return () => { ls.delete(l); }; },
  };
}
export function useStore<T>(s: Store<T>): T {
  const [v, setV] = useState(s.get());
  useEffect(() => s.subscribe(() => setV(s.get())), [s]);
  return v;
}

export type Sheet = { type: 'new'; start: string; clientId?: string; serviceId?: string } | { type: 'appt'; id: string };
export interface ToastState { id: number; text: string; undo?: () => Promise<void> }
export interface DragState { entry: Entry; label: string; x: number; y: number; grabDY: number; left: number; width: number; over: { date: string; start: string } | null }
export interface ActionItem { label: string; role?: 'destructive' | 'cancel'; onPress: () => void }
export interface UiState {
  tab: Tab; view: 'day' | 'week' | 'month'; date: string;
  sheet: Sheet | null; client: string | null; toast: ToastState | null; highlight: string | null;
  drag: DragState | null; action: { title?: string; items: ActionItem[] } | null;
}
export const ui = createStore<UiState>({
  tab: 'calendar', view: 'day', date: todayStr(), sheet: null, client: null, toast: null, highlight: null, drag: null, action: null,
});
export const isBusy = () => { const s = ui.get(); return !!(s.sheet || s.action || s.client || s.drag); };
```

`src/ui/hooks.ts`:
```ts
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { repo } from '../db/repo';
import { DEFAULT_SETTINGS } from '../db/seed';
import type { Service, Settings } from '../db/types';

export function useLive<T>(q: () => T | Promise<T>, deps: unknown[], initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(q).subscribe({ next: setV, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
export const useSettings = (): Settings => useLive(() => repo.getSettings(), [], DEFAULT_SETTINGS);
export const useServices = (activeOnly = false): Service[] => useLive(() => repo.listServices(activeOnly), [activeOnly], []);
```
(If ESLint complains about the unknown `react-hooks` rule name in the disable comment, remove the comment.)

`src/ui/actions.ts`:
```ts
import { repo } from '../db/repo';
import { ui } from './store';

let toastId = 0;
let toastTimer = 0;
export function showToast(text: string, undo?: () => Promise<void>) {
  clearTimeout(toastTimer);
  ui.set({ toast: { id: ++toastId, text, undo } });
  toastTimer = window.setTimeout(() => ui.set({ toast: null }), 5000);
}
export function openNew(start: string, extra: { clientId?: string; serviceId?: string } = {}) {
  ui.set({ sheet: { type: 'new', start, ...extra } });
}
export async function openNewToday() {
  openNew(await repo.defaultStartFor(ui.get().date));
}
export const openAppt = (id: string) => ui.set({ sheet: { type: 'appt', id } });
export const closeSheet = () => ui.set({ sheet: null });
export function highlight(id: string) {
  ui.set({ highlight: id });
  window.setTimeout(() => ui.set({ highlight: null }), 1800);
}
```

- [ ] **Step 6: Components**

`src/ui/components/TabBar.tsx` — replace the props with the store: keep the `Tab` type and `TABS`; component becomes:
```tsx
import { ui, useStore } from '../store';
export function TabBar() {
  const { tab } = useStore(ui);
  return (
    <nav class="tabbar">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} data-testid={`tab-${id}`} class={tab === id ? 'tab active' : 'tab'} onClick={() => ui.set({ tab: id })}>
          <Icon />
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}
```

`src/ui/components/EntryBlock.tsx` (drag is attached in Task 12):
```tsx
import type { Entry } from '../../db/repo';
import { t } from '../../i18n/lt';
import { timePart } from '../../logic/time';
import { openAppt } from '../actions';
import { ui, useStore } from '../store';

export function EntryBlock({ e, startMin, col, cols, compact }: { e: Entry; startMin: number; col: number; cols: number; compact: boolean }) {
  const { highlight } = useStore(ui);
  const mins = +e.appt.start.slice(11, 13) * 60 + +e.appt.start.slice(14, 16);
  const thin = e.appt.status === 'cancelled';
  const style = thin
    ? { top: `calc(var(--row) * ${(mins - startMin) / 15})` }
    : {
        top: `calc(var(--row) * ${(mins - startMin) / 15})`,
        height: `calc(var(--row) * ${e.minutes / 15})`,
        left: `${(col / cols) * 100}%`,
        width: `${100 / cols}%`,
      };
  const cls = ['entry', thin ? 'thin' : '', e.appt.status === 'noshow' ? 'noshow' : '', highlight === e.appt.id ? 'highlight' : ''].join(' ');
  return (
    <button class={cls} style={{ ...style, '--svc': `var(--c-${e.color})` } as preact.JSX.CSSProperties} data-testid={`entry-${e.appt.id}`} data-entry-id={e.appt.id}
      onClick={() => openAppt(e.appt.id)}>
      <span class="entry-time">{timePart(e.appt.start)}</span>
      <b class="entry-name">{e.label}</b>
      {!compact && e.service && <span class="entry-svc">{e.service.name}</span>}
      {e.appt.status === 'noshow' && <span class="entry-svc">{t('status.noshow')}</span>}
    </button>
  );
}
```

`src/ui/components/TimelineGrid.tsx`:
```tsx
import { useEffect, useRef } from 'preact/hooks';
import { repo } from '../../db/repo';
import { layoutColumns, visibleRange } from '../../logic/layout';
import { addDays, datePart, hhmm, minutesOfDay, nowLocal } from '../../logic/time';
import { t } from '../../i18n/lt';
import { openNew } from '../actions';
import { useLive, useSettings } from '../hooks';
import { EntryBlock } from './EntryBlock';

export function TimelineGrid({ dates, compact, onSwipe }: { dates: string[]; compact: boolean; onSwipe?: (dir: -1 | 1) => void }) {
  const settings = useSettings();
  const first = dates[0], last = dates[dates.length - 1];
  const entries = useLive(() => repo.entriesBetween(first, addDays(last, 1)), [first, last], []);
  const { startMin, endMin } = visibleRange(settings, entries);
  const rows = (endMin - startMin) / 15;
  const scroller = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { // open near the first booking, else near now, else the top
    const el = scroller.current;
    if (!el) return;
    const dayEntries = entries.filter((e) => e.appt.status !== 'cancelled');
    const target = dayEntries.length ? Math.min(...dayEntries.map((e) => minutesOfDay(e.appt.start))) : minutesOfDay(nowLocal());
    el.scrollTop = Math.max(0, ((target - startMin) / 15) * el.scrollHeight / rows - 88);
  }, [first, entries.length === 0]); // eslint-disable-line

  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);

  return (
    <div class="grid-scroll" ref={scroller} data-testid="timeline"
      onTouchStart={(ev) => { const p = ev.touches[0]; touch.current = { x: p.clientX, y: p.clientY }; }}
      onTouchEnd={(ev) => {
        const s = touch.current; touch.current = null;
        if (!s || !onSwipe || !ev.changedTouches[0]) return;
        const dx = ev.changedTouches[0].clientX - s.x, dy = ev.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
      }}>
      <div class="grid" style={{ height: `calc(var(--row) * ${rows})` }}>
        <div class="gutter">
          {hours.map((m) => (<div key={m} class="hour" style={{ height: 'calc(var(--row) * 4)' }}>{hhmm(m)}</div>))}
        </div>
        {dates.map((d) => {
          const dayEntries = entries.filter((e) => datePart(e.appt.start) === d);
          const live = dayEntries.filter((e) => e.appt.status !== 'cancelled');
          const lay = layoutColumns(live.map((e) => {
            const s = minutesOfDay(e.appt.start);
            return { id: e.appt.id, start: s, end: s + e.minutes };
          }));
          return (
            <div key={d} class="col" data-col-date={d} data-range-start={startMin} data-rows={rows} data-testid={`col-${d}`}>
              {Array.from({ length: rows }, (_, i) => {
                const slot = `${d}T${hhmm(startMin + i * 15)}`;
                return (<button key={slot} class={i % 4 === 0 ? 'slot hour-line' : 'slot'} data-testid={`slot-${slot}`} aria-label={slot.slice(11)} onClick={() => openNew(slot)} />);
              })}
              {dayEntries.map((e) => {
                const l = lay.get(e.appt.id) ?? { col: 0, cols: 1 };
                return <EntryBlock key={e.appt.id} e={e} startMin={startMin} col={l.col} cols={l.cols} compact={compact} />;
              })}
              {entries.length === 0 && dates.length === 1 && <p class="empty" data-testid="empty-day">{t('empty.day')}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```
`aria-label={slot.slice(11)}` is a time string, not UI language text.

`src/ui/components/WeekStrip.tsx`:
```tsx
import { repo } from '../../db/repo';
import { weekdayShort } from '../../i18n/format';
import { addDays, todayStr, weekStart } from '../../logic/time';
import { useLive } from '../hooks';
import { ui, useStore } from '../store';

export function WeekStrip() {
  const { date } = useStore(ui);
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const counts = useLive(() => repo.countsByDate(start, addDays(start, 7)), [start], new Map<string, number>());
  const today = todayStr();
  return (
    <div class="weekstrip">
      {days.map((d) => (
        <button key={d} class={['chip-day', d === date ? 'sel' : '', d === today ? 'today' : ''].join(' ')} data-chip-date={d} data-testid={`chip-${d}`}
          onClick={() => ui.set({ date: d })}>
          <span class="wd">{weekdayShort(d)}</span>
          <span class="num">{+d.slice(8, 10)}</span>
          <span class={counts.get(d) ? 'dot on' : 'dot'} />
        </button>
      ))}
    </div>
  );
}
```

`src/ui/screens/Calendar.tsx` (Day view now; Week/Month added in Task 9):
```tsx
import { formatDayLong } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, todayStr } from '../../logic/time';
import { openNewToday } from '../actions';
import { PlusIcon } from '../icons';
import { ui, useStore } from '../store';
import { TimelineGrid } from '../components/TimelineGrid';
import { WeekStrip } from '../components/WeekStrip';

export function CalendarScreen() {
  const { view, date } = useStore(ui);
  const flip = (dir: -1 | 1) => ui.set({ date: addDays(ui.get().date, dir) });
  return (
    <section class="cal" data-testid="calendar">
      <header class="navbar">
        <button class="nav-btn" data-testid="btn-today" onClick={() => ui.set({ date: todayStr() })}>{t('nav.today')}</button>
        <button class="nav-btn plus" data-testid="btn-add" aria-label={t('sheet.new.title')} onClick={() => void openNewToday()}><PlusIcon /></button>
      </header>
      <h1 class="large-title" data-testid="title">{formatDayLong(date)}</h1>
      <WeekStrip />
      {view === 'day' && <TimelineGrid dates={[date]} compact={false} onSwipe={flip} />}
    </section>
  );
}
```

`src/ui/components/Sheets.tsx` (placeholder host; filled in Tasks 10–11):
```tsx
export function Sheets() { return null; }
```

`src/app.tsx`:
```tsx
import { CalendarScreen } from './ui/screens/Calendar';
import { Sheets } from './ui/components/Sheets';
import { TabBar } from './ui/components/TabBar';
import { ui, useStore } from './ui/store';
import { t } from './i18n/lt';

export function App() {
  const { tab } = useStore(ui);
  return (
    <div class="app" data-testid="app">
      <main class="screen">
        {tab === 'calendar' ? <CalendarScreen /> : <h1 class="large-title">{t(`tab.${tab}`)}</h1>}
      </main>
      <TabBar />
      <Sheets />
    </div>
  );
}
```

In `src/main.tsx`: change `initUpdates(() => false)` to `initUpdates(isBusy)` (`import { isBusy } from './ui/store'`), and after `ensureSeed` add the e2e hook:
```tsx
if (import.meta.env.MODE === 'e2e') {
  const [{ repo }, { ui }] = await Promise.all([import('./db/repo'), import('./ui/store')]);
  (window as unknown as Record<string, unknown>).__vizitai = { db, repo, ui };
}
```

Append to `src/styles.css`:
```css
.cal { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.navbar { display: flex; justify-content: space-between; align-items: center; padding: 0 .5rem; }
.nav-btn { color: var(--blue); padding: 0 .6rem; }
.weekstrip { display: flex; padding: 0 .5rem .4rem; border-bottom: .5px solid var(--sep); }
.chip-day { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px; border-radius: .8rem; min-height: 56px; }
.chip-day .wd { font-size: .7rem; color: var(--label2); text-transform: lowercase; }
.chip-day .num { font-size: 1.05rem; width: 2rem; height: 2rem; line-height: 2rem; text-align: center; border-radius: 50%; }
.chip-day.today .num { color: var(--blue); font-weight: 600; }
.chip-day.sel .num { background: var(--blue); color: #fff; }
.dot { width: 5px; height: 5px; border-radius: 50%; background: transparent; }
.dot.on { background: var(--label2); }
.grid-scroll { flex: 1; overflow-y: auto; overscroll-behavior: none; -webkit-overflow-scrolling: touch; }
.grid { position: relative; display: flex; }
.gutter { width: 3.2rem; flex: none; font-size: .72rem; color: var(--label2); }
.hour { box-sizing: border-box; padding: 0 .4rem; text-align: right; }
.col { position: relative; flex: 1; min-width: 0; border-left: .5px solid var(--sep); }
.slot { display: block; width: 100%; height: var(--row); min-height: var(--row); border-bottom: .5px dotted var(--sep); }
.slot.hour-line { border-top: .5px solid var(--sep); }
.entry { position: absolute; box-sizing: border-box; padding: .2rem .4rem; text-align: left; overflow: hidden; border-radius: .5rem; border-left: 4px solid var(--svc);
  background: color-mix(in srgb, var(--svc) 18%, var(--card)); display: flex; flex-direction: column; min-height: 0;
  -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; touch-action: pan-y; }
.entry-time { font-size: .72rem; color: var(--label2); }
.entry-name { font-size: .95rem; line-height: 1.15; }
.entry-svc { font-size: .75rem; color: var(--label2); }
.entry.thin { left: 0; right: 0; width: auto; height: .9rem; min-height: 0; padding: 0 .4rem; opacity: .45; text-decoration: line-through; pointer-events: none; flex-direction: row; gap: .4rem; align-items: center; border-radius: 0; }
.entry.noshow { opacity: .6; }
.entry.highlight { animation: flash 1.6s ease-out; }
@keyframes flash { 0% { box-shadow: 0 0 0 3px var(--blue); } 100% { box-shadow: 0 0 0 0 transparent; } }
.empty { position: absolute; inset: 40% 0 auto; text-align: center; color: var(--label2); pointer-events: none; }
```

- [ ] **Step 7: E2E helpers and tests**

`tests/e2e/helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test';

export const NOW = '2026-10-14T09:00:00';
export async function openApp(page: Page, now = NOW) {
  await page.clock.install({ time: new Date(now) });
  await page.goto('/');
  await expect(page.getByTestId('app')).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __vizitai?: unknown }).__vizitai);
}
/** Seeds appointments (kind client) via the repo; returns their ids. */
export async function seedAppts(page: Page, list: { name: string; start: string; service?: number }[]) {
  return page.evaluate(async (items) => {
    const { repo } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    const svc = await repo.listServices(true);
    const ids: string[] = [];
    for (const i of items) ids.push((await repo.createAppointment({ kind: 'client', name: i.name, serviceId: svc[i.service ?? 0].id, start: i.start })).id);
    return ids;
  }, list);
}
export const apptState = (page: Page, id: string) =>
  page.evaluate((x) => (window as any).__vizitai.repo.getAppointment(x), id); // eslint-disable-line @typescript-eslint/no-explicit-any
```

`tests/e2e/calendar.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

test('opens on today with a Lithuanian title and week strip', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
  await expect(page.getByTestId('chip-2026-10-14')).toHaveClass(/sel/);
  await expect(page.getByTestId('empty-day')).toHaveText('Šią dieną vizitų nėra');
});

test('entries render at their times and a bookings dot appears', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-14T10:00' }]);
  const entry = page.getByTestId(`entry-${id}`);
  await expect(entry).toContainText('10:00');
  await expect(entry).toContainText('Žydrūnė');
  const slot = await page.getByTestId('slot-2026-10-14T10:00').boundingBox();
  const box = await entry.boundingBox();
  expect(Math.abs(box!.y - slot!.y)).toBeLessThan(2);
  await expect(page.getByTestId('chip-2026-10-14').locator('.dot.on')).toHaveCount(1);
});

test('tapping an empty row opens the new sheet for that slot', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  const sheet = await page.evaluate(() => (window as any).__vizitai.ui.get().sheet); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(sheet).toMatchObject({ type: 'new', start: '2026-10-14T10:30' });
});

test('the week strip and Šiandien change the day', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('chip-2026-10-16').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 16 d., penktadienis');
  await page.getByTestId('btn-today').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
});

test('a booking at 10:00 on the DST change day still shows 10:00', async ({ page }) => {
  await openApp(page, '2026-10-25T09:00:00');
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-25T10:00' }]);
  await expect(page.getByTestId(`entry-${id}`)).toContainText('10:00');
});

test('a booking outside working hours stays visible', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T06:30' }]);
  await expect(page.getByTestId(`entry-${id}`)).toBeVisible();
  await expect(page.getByTestId('slot-2026-10-14T06:30')).toBeVisible();
});
```

- [ ] **Step 8: Run** `npm run typecheck && npm run lint && npm test && npm run e2e` → PASS. (`no-literals` must stay green: only `{t(...)}` / format helpers in TSX.)

- [ ] **Step 9: Commit**
```bash
git add -A && git commit -m "feat: add Day view with week strip, timeline and layout logic"
```

### Task 9: Week view, Month view, view switch

**Files:**
- Create: `src/ui/components/MonthGrid.tsx`
- Modify: `src/ui/screens/Calendar.tsx`, `src/styles.css`
- Test: `tests/e2e/calendar-views.spec.ts`

**Interfaces:**
- Consumes: `TimelineGrid` (multi-date, `compact`), `repo.countsByDate`, `weekStart`, `addDays`, `monthName`, `formatDayShort`.
- Produces: `MonthGrid` (no props; reads `ui.date`); Calendar title rules: day → `formatDayLong`, week → `"{short first} – {short last}"`, month → `"{monthName} {year}"`.

- [ ] **Step 1: Failing e2e** — `tests/e2e/calendar-views.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

test('Savaitė shows seven columns with compact entries', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-15T10:00' }]);
  await page.getByTestId('seg-week').click();
  for (const d of ['2026-10-12', '2026-10-14', '2026-10-18']) await expect(page.getByTestId(`col-${d}`)).toBeVisible();
  await expect(page.getByTestId('col-2026-10-15').getByTestId(`entry-${id}`)).toContainText('Ona');
  await expect(page.getByTestId('title')).toContainText('spalio 12 d.');
});

test('the year-end week runs 28 Dec to 3 Jan', async ({ page }) => {
  await openApp(page, '2026-12-30T09:00:00');
  await page.getByTestId('seg-week').click();
  await expect(page.getByTestId('col-2026-12-28')).toBeVisible();
  await expect(page.getByTestId('col-2027-01-03')).toBeVisible();
});

test('Mėnuo shows booking counts and a tap opens that day', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'A', start: '2026-10-20T10:00' }, { name: 'B', start: '2026-10-20T12:00' }]);
  await page.getByTestId('month-name').click();
  await expect(page.getByTestId('month-cell-2026-10-20')).toContainText('2');
  await page.getByTestId('month-cell-2026-10-20').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 20 d., antradienis');
});

test('Savaitė header chips open the day', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('seg-week').click();
  await page.getByTestId('weekhead-2026-10-16').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 16 d., penktadienis');
});
```

- [ ] **Step 2: Run** `npm run e2e -- calendar-views` → FAIL.

- [ ] **Step 3: Implement**

`src/ui/components/MonthGrid.tsx`:
```tsx
import { repo } from '../../db/repo';
import { weekdayShort } from '../../i18n/format';
import { addDays, todayStr, weekStart } from '../../logic/time';
import { useLive } from '../hooks';
import { ui, useStore } from '../store';

export function MonthGrid() {
  const { date } = useStore(ui);
  const first = `${date.slice(0, 8)}01`;
  const gridStart = weekStart(first);
  const nextMonthFirst = addDays(`${date.slice(0, 8)}28`, 4).slice(0, 8) + '01';
  const weeks = Math.ceil((((Date.parse(nextMonthFirst) - Date.parse(gridStart)) / 86400000)) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const counts = useLive(() => repo.countsByDate(gridStart, addDays(gridStart, weeks * 7)), [gridStart, weeks], new Map<string, number>());
  const today = todayStr();
  return (
    <div class="month" data-testid="month">
      <div class="month-head">{days.slice(0, 7).map((d) => <span key={d}>{weekdayShort(d)}</span>)}</div>
      <div class="month-body">
        {days.map((d) => (
          <button key={d} data-testid={`month-cell-${d}`} class={['month-cell', d.slice(0, 7) !== date.slice(0, 7) ? 'out' : '', d === today ? 'today' : ''].join(' ')}
            onClick={() => ui.set({ view: 'day', date: d })}>
            <span class="num">{+d.slice(8, 10)}</span>
            {counts.get(d) ? <span class="count">{counts.get(d)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Replace `src/ui/screens/Calendar.tsx`:
```tsx
import { formatDayLong, formatDayShort, monthName, weekdayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addDays, todayStr, weekStart } from '../../logic/time';
import { openNewToday } from '../actions';
import { ChevronIcon, PlusIcon } from '../icons';
import { ui, useStore, type UiState } from '../store';
import { MonthGrid } from '../components/MonthGrid';
import { TimelineGrid } from '../components/TimelineGrid';
import { WeekStrip } from '../components/WeekStrip';

function titleFor(view: UiState['view'], date: string) {
  if (view === 'day') return formatDayLong(date);
  if (view === 'week') { const s = weekStart(date); return `${formatDayShort(s)} – ${formatDayShort(addDays(s, 6))}`; }
  return `${monthName(date)} ${date.slice(0, 4)}`;
}

export function CalendarScreen() {
  const { view, date } = useStore(ui);
  const step = (dir: -1 | 1) => {
    const d = ui.get().date;
    ui.set({ date: view === 'week' ? addDays(d, 7 * dir) : view === 'month' ? addDays(`${d.slice(0, 8)}15`, 30 * dir) : addDays(d, dir) });
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  return (
    <section class="cal" data-testid="calendar">
      <header class="navbar">
        <button class="nav-btn" data-testid="btn-today" onClick={() => ui.set({ date: todayStr() })}>{t('nav.today')}</button>
        <div class="segmented" role="group">
          {(['day', 'week'] as const).map((v) => (
            <button key={v} data-testid={`seg-${v}`} class={view === v ? 'seg on' : 'seg'} onClick={() => ui.set({ view: v })}>{t(`view.${v}`)}</button>
          ))}
        </div>
        <button class="nav-btn plus" data-testid="btn-add" aria-label={t('sheet.new.title')} onClick={() => void openNewToday()}><PlusIcon /></button>
      </header>
      <div class="title-row">
        <h1 class="large-title" data-testid="title">{titleFor(view, date)}</h1>
        <button class="nav-btn" data-testid="month-name" onClick={() => ui.set({ view: view === 'month' ? 'day' : 'month' })}>
          {monthName(date)} <ChevronIcon />
        </button>
      </div>
      {view === 'day' && <WeekStrip />}
      {view === 'week' && (
        <div class="weekhead">
          {days.map((d) => (
            <button key={d} data-testid={`weekhead-${d}`} class={d === todayStr() ? 'wh today' : 'wh'} onClick={() => ui.set({ view: 'day', date: d })}>
              <span>{weekdayShort(d)}</span><b>{+d.slice(8, 10)}</b>
            </button>
          ))}
        </div>
      )}
      {view === 'day' && <TimelineGrid dates={[date]} compact={false} onSwipe={step} />}
      {view === 'week' && <TimelineGrid dates={days} compact onSwipe={step} />}
      {view === 'month' && <MonthGrid />}
    </section>
  );
}
```
In week view the timeline gutter is 3.2rem; the weekhead gets a matching left margin in CSS.

Append to `src/styles.css`:
```css
.segmented { display: inline-flex; background: var(--fill); border-radius: .6rem; padding: 2px; }
.seg { min-height: 32px; padding: 0 .9rem; border-radius: .5rem; font-size: .9rem; }
.seg.on { background: var(--card); box-shadow: 0 1px 3px rgba(0,0,0,.2); }
.title-row { display: flex; align-items: center; justify-content: space-between; }
.title-row .large-title { font-size: 1.35rem; }
.weekhead { display: flex; margin-left: 3.2rem; border-bottom: .5px solid var(--sep); }
.wh { flex: 1; display: flex; flex-direction: column; align-items: center; font-size: .7rem; color: var(--label2); }
.wh b { font-size: 1rem; color: var(--label); }
.wh.today b { color: var(--blue); }
.month { flex: 1; overflow-y: auto; padding: 0 .5rem; }
.month-head, .month-body { display: grid; grid-template-columns: repeat(7, 1fr); }
.month-head span { text-align: center; font-size: .72rem; color: var(--label2); padding: .3rem 0; }
.month-cell { min-height: 3.4rem; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 2px; border-top: .5px solid var(--sep); padding-top: .3rem; }
.month-cell.out { opacity: .35; }
.month-cell.today .num { color: var(--blue); font-weight: 600; }
.month-cell .count { font-size: .7rem; background: var(--blue); color: #fff; border-radius: 1rem; padding: 0 .4rem; }
.col .entry.compact { padding: .1rem .25rem; }
```

- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test && npm run e2e` → PASS.

- [ ] **Step 5: Commit, push, PR (M2)**
```bash
git add -A && git commit -m "feat: add Week and Month views"
git push -u origin m2-calendar
gh pr create --title "M2: calendar views" --body "Day, Week, Month, swipe, Šiandien, working-hours growth.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

## M3 – Add flow

**Done when:** booking from an empty slot takes 3 taps plus typing the name.

### Task 10: Sheet component and the new-appointment sheet

**Files:**
- Create: `src/ui/components/Sheet.tsx`, `src/ui/components/NewSheet.tsx`
- Modify: `src/ui/components/Sheets.tsx`, `src/styles.css`
- Test: `tests/e2e/add-flow.spec.ts`

**Interfaces:**
- Produces: `Sheet({ title, left?, right?, onClose, children, testId? })` (bottom sheet with grabber, backdrop, 300 ms slide); `NewSheet({ prefill })` where `prefill: { start: string; clientId?: string; serviceId?: string }`.
- Consumes: `repo.searchClients`, `repo.findOverlapFor`, `repo.createAppointment`, `repo.lastServiceId`, `repo.getClient`, `ui`, `highlight`, `closeSheet`.

- [ ] **Step 1: Failing e2e** — `tests/e2e/add-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

test('booking from an empty slot takes 3 taps plus typing the name', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    (window as any).__taps = 0; // eslint-disable-line @typescript-eslint/no-explicit-any
    document.addEventListener('click', (e) => { if (e.isTrusted) (window as any).__taps++; }, true); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  await page.getByTestId('slot-2026-10-14T10:30').click();               // tap 1
  await page.getByTestId('field-name').fill('Žydrūnė');                  // typing, no tap (autofocus)
  await page.getByTestId('svc-1').click();                               // tap 2 (Dažymas)
  await page.getByTestId('btn-save').click();                            // tap 3
  expect(await page.evaluate(() => (window as any).__taps)).toBe(3);     // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Žydrūnė');
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Dažymas');
});

test('Išsaugoti is disabled until a name is typed', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await expect(page.getByTestId('btn-save')).toBeDisabled();
  await page.getByTestId('field-name').fill('  ');
  await expect(page.getByTestId('btn-save')).toBeDisabled();
});

test('searching "zydrune" finds Žydrūnė, and a typed existing name links that client', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-13T10:00', service: 2 }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await page.getByTestId('field-name').fill('zydrune');
  await expect(page.getByTestId('suggest-0')).toHaveText('Žydrūnė');
  await page.getByTestId('suggest-0').click();
  await expect(page.getByTestId('svc-2')).toHaveClass(/on/); // last service preselected
  await page.getByTestId('btn-save').click();
  const count = await page.evaluate(() => (window as any).__vizitai.db.clients.count()); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(count).toBe(1);
});

test('empty name field lists the recent clients', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-13T10:00' }, { name: 'Jonas', start: '2026-10-13T11:00' }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await expect(page.getByTestId('suggest-0')).toHaveText('Jonas');
  await expect(page.getByTestId('suggest-1')).toHaveText('Ona');
});

test('an overlap warns on the first Išsaugoti and saves on the second', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('slot-2026-10-14T10:15').click();
  await page.getByTestId('field-name').fill('Jonas');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('overlap-warning')).toHaveText('Šiuo laiku jau užregistruota: Ona – Kirpimas');
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
});

test('Asmeninis uses a title and hides the services', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('type-personal').click();
  await expect(page.getByTestId('svc-0')).toHaveCount(0);
  await page.getByTestId('field-name').fill('Pietūs');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Pietūs');
});

test('"+" proposes the next free slot today and dayStart on other days', async ({ page }) => {
  await openApp(page, '2026-10-14T09:05:00');
  await page.getByTestId('btn-add').click();
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().sheet.start)).toBe('2026-10-14T09:15'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('btn-dismiss').click();
  await page.getByTestId('chip-2026-10-15').click();
  await page.getByTestId('btn-add').click();
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().sheet.start)).toBe('2026-10-15T08:00'); // eslint-disable-line @typescript-eslint/no-explicit-any
});
```

- [ ] **Step 2: Run** `npm run e2e -- add-flow` → FAIL.

- [ ] **Step 3: Implement**

`src/ui/components/Sheet.tsx`:
```tsx
import type { ComponentChildren } from 'preact';

export function Sheet({ title, left, right, onClose, children, testId = 'sheet' }: {
  title: string; left?: ComponentChildren; right?: ComponentChildren; onClose: () => void; children: ComponentChildren; testId?: string;
}) {
  return (
    <div class="sheet-root">
      <div class="backdrop" onClick={onClose} />
      <div class="sheet" role="dialog" aria-label={title} data-testid={testId}>
        <div class="grabber" />
        <header class="sheet-nav">
          <div class="side l">{left}</div>
          <h2>{title}</h2>
          <div class="side r">{right}</div>
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
```

`src/ui/components/NewSheet.tsx`:
```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import type { Client } from '../../db/types';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { cleanName } from '../../logic/names';
import { datePart, snap } from '../../logic/time';
import { closeSheet, highlight } from '../actions';
import { useLive, useServices } from '../hooks';
import { ui } from '../store';
import { Sheet } from './Sheet';

export function NewSheet({ prefill }: { prefill: { start: string; clientId?: string; serviceId?: string } }) {
  const services = useServices(true);
  const [kind, setKind] = useState<'client' | 'personal'>('client');
  const [name, setName] = useState('');
  const [linked, setLinked] = useState<Client | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(prefill.serviceId ?? null);
  const [start, setStart] = useState(prefill.start);
  const [clash, setClash] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const matches = useLive(() => repo.searchClients(name), [name], [] as Client[]);
  const sid = serviceId ?? services[0]?.id ?? null;
  const canSave = cleanName(name).length > 0;

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (prefill.clientId) void repo.getClient(prefill.clientId).then((c) => { if (c) void pick(c, !prefill.serviceId); });
  }, []); // eslint-disable-line

  async function pick(c: Client, useLast = true) {
    setLinked(c); setName(c.name); setClash(null);
    if (useLast) { const last = await repo.lastServiceId(c.id); if (last) setServiceId(last); }
  }
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setClash(null); };

  async function save() {
    if (!canSave) return;
    const hit = await repo.findOverlapFor({ start, kind, serviceId: kind === 'client' ? sid : null });
    if (hit && clash === null) { setClash(t('warn.overlap', { vardas: hit.label, paslauga: hit.serviceName })); return; }
    const a = await repo.createAppointment(kind === 'client'
      ? { kind, name, serviceId: sid, start } : { kind, title: name, start });
    ui.set({ sheet: null, date: datePart(a.start) });
    highlight(a.id);
  }

  return (
    <Sheet title={t('sheet.new.title')} onClose={closeSheet}
      left={<button data-testid="btn-dismiss" onClick={closeSheet}>{t('btn.dismiss')}</button>}
      right={<button class="strong" data-testid="btn-save" disabled={!canSave} onClick={() => void save()}>{t('btn.save')}</button>}>
      <div class="segmented wide">
        {(['client', 'personal'] as const).map((k) => (
          <button key={k} data-testid={`type-${k}`} class={kind === k ? 'seg on' : 'seg'} onClick={() => { setKind(k); setLinked(null); setClash(null); }}>{t(`type.${k}`)}</button>
        ))}
      </div>
      <input ref={input} class="field" data-testid="field-name" value={name} autocomplete="off" autocapitalize="words"
        placeholder={kind === 'client' ? t('field.name') : t('field.title')}
        onInput={(e) => { setName((e.target as HTMLInputElement).value); setLinked(null); setClash(null); }} />
      {kind === 'client' && (
        <ul class="suggest">
          {!name.trim() && matches.length > 0 && <li class="suggest-head">{t('suggest.recent')}</li>}
          {matches.filter((c) => c.id !== linked?.id).map((c, i) => (
            <li key={c.id}><button data-testid={`suggest-${i}`} onClick={() => void pick(c)}>{c.name}</button></li>
          ))}
        </ul>
      )}
      {kind === 'client' && (
        <>
          <p class="label">{t('field.service')}</p>
          <div class="chips">
            {services.map((s, i) => (
              <button key={s.id} data-testid={`svc-${i}`} class={sid === s.id ? 'chip on' : 'chip'} style={{ '--svc': `var(--c-${s.color})` } as preact.JSX.CSSProperties}
                onClick={() => touch(setServiceId)(s.id)}>{s.name}</button>
            ))}
          </div>
        </>
      )}
      <label class="row timerow">
        <span class="label">{t('field.time')}</span>
        <span class="value" data-testid="time-value">{formatWhen(start)}</span>
        <input type="datetime-local" step={900} value={start} data-testid="time-input"
          onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) touch(setStart)(snap(v)); }} />
      </label>
      {clash && <p class="warn" role="alert" data-testid="overlap-warning">{clash}</p>}
    </Sheet>
  );
}
```

`src/ui/components/Sheets.tsx`:
```tsx
import { NewSheet } from './NewSheet';
import { ui, useStore } from '../store';

export function Sheets() {
  const { sheet } = useStore(ui);
  if (sheet?.type === 'new') return <NewSheet key={`${sheet.start}${sheet.clientId ?? ''}`} prefill={sheet} />;
  return null;
}
```

Append to `src/styles.css`:
```css
.sheet-root { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; }
.backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.35); animation: fade .3s; }
.sheet { position: relative; width: 100%; max-height: 90dvh; display: flex; flex-direction: column; background: var(--bg); border-radius: 1.2rem 1.2rem 0 0;
  padding-bottom: env(safe-area-inset-bottom); animation: rise .3s ease-out; }
.grabber { width: 2.4rem; height: 5px; border-radius: 3px; background: var(--sep); margin: 6px auto 0; }
.sheet-nav { display: flex; align-items: center; justify-content: space-between; padding: 0 .6rem; }
.sheet-nav h2 { font-size: 1rem; margin: 0; }
.sheet-nav .side { min-width: 5rem; }
.sheet-nav .side.r { text-align: right; }
.sheet-nav button { color: var(--blue); padding: 0 .4rem; }
.sheet-nav button.strong { font-weight: 600; }
.sheet-nav button:disabled { opacity: .4; }
.sheet-body { overflow-y: auto; padding: .5rem 1rem 1rem; }
.field { width: 100%; box-sizing: border-box; padding: .7rem .8rem; margin-top: .6rem; border: 0; border-radius: .7rem; background: var(--card); }
.segmented.wide { display: flex; }
.segmented.wide .seg { flex: 1; }
.suggest { list-style: none; margin: .3rem 0 0; padding: 0; background: var(--card); border-radius: .7rem; }
.suggest:empty { display: none; }
.suggest li button { width: 100%; text-align: left; padding: 0 .8rem; border-top: .5px solid var(--sep); }
.suggest li:first-child button { border-top: 0; }
.suggest-head { font-size: .75rem; color: var(--label2); padding: .4rem .8rem 0; }
.label { font-size: .8rem; color: var(--label2); margin: .9rem 0 .3rem; }
.chips { display: flex; flex-wrap: wrap; gap: .4rem; }
.chip { padding: 0 .9rem; min-height: 44px; border-radius: 2rem; background: var(--card); border: 2px solid transparent; }
.chip.on { border-color: var(--svc); background: color-mix(in srgb, var(--svc) 18%, var(--card)); }
.row { display: flex; align-items: center; justify-content: space-between; background: var(--card); border-radius: .7rem; padding: 0 .8rem; min-height: 44px; margin-top: .9rem; position: relative; }
.row .label { margin: 0; }
.timerow input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
.warn { color: var(--red); margin: .6rem 0 0; }
@keyframes rise { from { transform: translateY(100%); } to { transform: none; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test && npm run e2e` → PASS. If the 3-tap test counts a synthetic click on the hidden date input or autofocus, investigate rather than loosening the assertion.

- [ ] **Step 5: Commit, push, PR (M3)**
```bash
git add -A && git commit -m "feat: add the new-appointment sheet with prefill, autocomplete and overlap warning"
git push -u origin m3-add-flow
gh pr create --title "M3: add flow" --body "New appointment sheet. Uses datetime-local with an invisible overlay input; value is snapped to 15 min in code because iOS ignores step. Needs on-device check: keyboard autofocus after tapping a slot, and the picker opening from the overlay.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 6: Manual device checks (owner)**
  - [ ] Tapping an empty row opens the sheet with the keyboard already up.
  - [ ] Tapping the time row opens the native iOS date and time picker, in Lithuanian; picking a time that is not a multiple of 15 saves snapped to the 15-minute grid.
