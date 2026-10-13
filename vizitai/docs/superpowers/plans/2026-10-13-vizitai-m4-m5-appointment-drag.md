# M4 + M5 – Appointment sheet and drag to reschedule

Read the index first. Branches: `m4-appointment`, then `m5-drag` (each from updated `main`, one PR each). Commands run in `vizitai/`.

## M4 – Appointment sheet

**Done when:** cancel and undo e2e tests pass and the freed slot is bookable.

### Task 11: Action sheet, toast, appointment sheet

**Files:**
- Create: `src/ui/components/ActionSheet.tsx`, `src/ui/components/Toast.tsx`, `src/ui/components/AppointmentSheet.tsx`
- Modify: `src/ui/actions.ts`, `src/ui/components/Sheets.tsx`, `src/styles.css`
- Test: `tests/e2e/appointment.spec.ts`

**Interfaces:**
- Consumes: `repo.getAppointment`, `getClient`, `updateAppointment`, `moveAppointment`, `cancelAppointment`, `markNoShow`, `restoreAppointment`, `putSnapshot`, `findOverlapFor`; `ui.action`, `ui.toast`, `useServices`.
- Produces (`actions.ts`):
```ts
moveWithToast(id: string, to: string): Promise<void>
cancelWithToast(id: string, reason: CancelReason | null): Promise<void>
noShowWithToast(id: string): Promise<void>
restoreWithToast(id: string): Promise<void>
confirmCancel(id: string): void            // opens the "Atšaukti vizitą?" action sheet
```
- Produces: `ActionSheet()` (reads `ui.action`), `ToastHost()` (reads `ui.toast`), `AppointmentSheet({ id })`.
- Test ids: `action-item-<n>`, `toast`, `toast-undo`, `act-move`, `move-input`, `act-noshow`, `act-cancel`, `act-restore`, `appt-name`, `appt-status`, `appt-svc-<n>`, `btn-close`.

- [ ] **Step 1: Failing e2e** — `tests/e2e/appointment.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

test('tapping an entry opens the sheet with name, service, time and status', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('appt-name')).toHaveText('Ona');
  await expect(page.getByTestId('appt-status')).toHaveText('Užregistruota');
  await expect(page.getByTestId('sheet')).toContainText('spalio 14 d., tr · 10:00');
  await expect(page.getByTestId('act-noshow')).toHaveCount(0); // start time has not passed
});

test('tapping a service chip changes the service immediately', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  const before = (await apptState(page, id)).serviceId;
  await page.getByTestId('appt-svc-1').click();
  await expect.poll(async () => (await apptState(page, id)).serviceId).not.toBe(before);
});

test('cancelling with a reason takes two taps; the slot frees up; Anuliuoti restores it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await expect(page.getByTestId('action-title')).toHaveText('Atšaukti vizitą?');
  await expect(page.getByTestId('action-item-0')).toHaveText('Kliento prašymu');
  await page.getByTestId('action-item-1').click(); // Liga
  const a = await apptState(page, id);
  expect(a).toMatchObject({ status: 'cancelled', cancelReason: 'ill' });
  await expect(page.getByTestId('toast')).toContainText('Vizitas atšauktas');
  // slot is free: the thin line does not block the tap
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.getByTestId('btn-dismiss').click();
  await page.getByTestId('toast-undo').click();
  expect(await apptState(page, id)).toMatchObject({ status: 'booked', cancelReason: null });
});

test('cancelling without a reason works', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-3').click(); // Be priežasties
  expect(await apptState(page, id)).toMatchObject({ status: 'cancelled', cancelReason: null });
});

test('"Palikti" keeps the appointment', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-4').click();
  expect((await apptState(page, id)).status).toBe('booked');
});

test('Neatvyko appears only after the start time, and Atkurti vizitą brings it back', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-noshow').click();
  expect((await apptState(page, id)).status).toBe('noshow');
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('act-noshow')).toHaveCount(0);
  await page.getByTestId('act-restore').click();
  expect((await apptState(page, id)).status).toBe('booked');
});

test('Perkelti moves the appointment, shows the toast and Anuliuoti undoes it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-move').click();
  await page.getByTestId('move-input').fill('2026-10-15T14:00');
  await expect(page.getByTestId('toast')).toContainText('Perkelta: spalio 15 d., kt · 14:00');
  expect((await apptState(page, id)).start).toBe('2026-10-15T14:00');
  await page.getByTestId('toast-undo').click();
  expect((await apptState(page, id)).start).toBe('2026-10-14T10:00');
});

test('moving onto another booking adds the overlap warning to the toast', async ({ page }) => {
  await openApp(page);
  const [a] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }, { name: 'Jonas', start: '2026-10-14T14:00' }]);
  await page.getByTestId(`entry-${a}`).click();
  await page.getByTestId('act-move').click();
  await page.getByTestId('move-input').fill('2026-10-14T14:15');
  await expect(page.getByTestId('toast')).toContainText('Šiuo laiku jau užregistruota: Jonas – Kirpimas');
});

test('the toast disappears after 5 seconds', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-3').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.clock.fastForward(5200);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});
```

- [ ] **Step 2: Run** `npm run e2e -- appointment` → FAIL.

- [ ] **Step 3: Actions** — append to `src/ui/actions.ts` (add the imports at the top):

```ts
import type { CancelReason } from '../db/types';
import { formatDayShort, weekdayShort } from '../i18n/format';
import { t } from '../i18n/lt';
import { datePart, timePart } from '../logic/time';

export async function moveWithToast(id: string, to: string) {
  const { before, after } = await repo.moveAppointment(id, to);
  if (before.start === after.start) return;
  const hit = await repo.findOverlapFor({ start: after.start, kind: after.kind, serviceId: after.serviceId, excludeId: id });
  let text = t('toast.moved', { data: `${formatDayShort(datePart(after.start))}, ${weekdayShort(after.start)}`, laikas: timePart(after.start) });
  if (hit) text += ` — ${t('warn.overlap', { vardas: hit.label, paslauga: hit.serviceName })}`;
  showToast(text, () => repo.putSnapshot(before));
}
export async function cancelWithToast(id: string, reason: CancelReason | null) {
  const { before } = await repo.cancelAppointment(id, reason);
  showToast(t('toast.cancelled'), () => repo.putSnapshot(before));
}
export async function noShowWithToast(id: string) {
  const { before } = await repo.markNoShow(id);
  showToast(t('toast.noshow'), () => repo.putSnapshot(before));
}
export async function restoreWithToast(id: string) {
  const { before } = await repo.restoreAppointment(id);
  showToast(t('toast.restored'), () => repo.putSnapshot(before));
}
export function confirmCancel(id: string) {
  const reasons: [CancelReason | null, 'cancel.reason.client' | 'cancel.reason.ill' | 'cancel.reason.other' | 'cancel.reason.none'][] = [
    ['client', 'cancel.reason.client'], ['ill', 'cancel.reason.ill'], ['other', 'cancel.reason.other'], [null, 'cancel.reason.none'],
  ];
  ui.set({
    action: {
      title: t('cancel.question'),
      items: [
        ...reasons.map(([r, key]) => ({ label: t(key), onPress: () => void cancelWithToast(id, r) })),
        { label: t('cancel.keep'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}
```

- [ ] **Step 4: Components**

`src/ui/components/ActionSheet.tsx`:
```tsx
import { ui, useStore } from '../store';

export function ActionSheet() {
  const { action } = useStore(ui);
  if (!action) return null;
  const close = () => ui.set({ action: null });
  const main = action.items.filter((i) => i.role !== 'cancel');
  const cancel = action.items.find((i) => i.role === 'cancel');
  const press = (fn: () => void) => () => { close(); fn(); };
  return (
    <div class="sheet-root action-root">
      <div class="backdrop" onClick={close} />
      <div class="actions">
        <div class="action-group">
          {action.title && <p class="action-title" data-testid="action-title">{action.title}</p>}
          {main.map((i, n) => (
            <button key={n} data-testid={`action-item-${n}`} class={i.role === 'destructive' ? 'action destructive' : 'action'} onClick={press(i.onPress)}>{i.label}</button>
          ))}
        </div>
        {cancel && <button data-testid={`action-item-${main.length}`} class="action cancel" onClick={press(cancel.onPress)}>{cancel.label}</button>}
      </div>
    </div>
  );
}
```
The "Palikti" button is index 4 (after the four reasons), matching the tests.

`src/ui/components/Toast.tsx`:
```tsx
import { t } from '../../i18n/lt';
import { ui, useStore } from '../store';

export function ToastHost() {
  const { toast } = useStore(ui);
  if (!toast) return null;
  return (
    <div class="toast" data-testid="toast" key={toast.id}>
      <span>{toast.text}</span>
      {toast.undo && (
        <button data-testid="toast-undo" onClick={() => { const u = toast.undo!; ui.set({ toast: null }); void u(); }}>{t('toast.undo')}</button>
      )}
    </div>
  );
}
```

`src/ui/components/AppointmentSheet.tsx`:
```tsx
import { useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { nowLocal, snap } from '../../logic/time';
import { closeSheet, confirmCancel, moveWithToast, noShowWithToast, restoreWithToast } from '../actions';
import { useLive, useServices } from '../hooks';
import { ui } from '../store';
import { Sheet } from './Sheet';

export function AppointmentSheet({ id }: { id: string }) {
  const appt = useLive(() => repo.getAppointment(id), [id], undefined);
  const client = useLive(async () => (appt?.clientId ? repo.getClient(appt.clientId) : undefined), [appt?.clientId], undefined);
  const all = useServices(false);
  const [inline, setInline] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  if (!appt) return null;

  const past = appt.start < nowLocal();
  const done = appt.status === 'booked' && past;
  const status = appt.status === 'cancelled' ? t('status.cancelled') : appt.status === 'noshow' ? t('status.noshow') : done ? t('status.done') : t('status.booked');
  const chips = all.filter((s) => s.active || s.id === appt.serviceId);
  const label = appt.kind === 'personal' ? appt.title ?? '' : client?.name ?? '';
  const after = (fn: () => Promise<void>) => () => { closeSheet(); void fn(); };

  function openMove() {
    try { picker.current?.showPicker(); } catch { setInline(true); }
  }

  return (
    <Sheet title={label} onClose={closeSheet} right={<button class="strong" data-testid="btn-close" onClick={closeSheet}>{t('btn.close')}</button>}>
      {appt.kind === 'client' ? (
        <button class="link-name" data-testid="appt-name" onClick={() => ui.set({ sheet: null, client: appt.clientId })}>{label}</button>
      ) : (
        <p class="link-name" data-testid="appt-name">{label}</p>
      )}
      {appt.kind === 'client' && (
        <div class="chips">
          {chips.map((s, i) => (
            <button key={s.id} data-testid={`appt-svc-${i}`} class={appt.serviceId === s.id ? 'chip on' : 'chip'} style={{ '--svc': `var(--c-${s.color})` } as preact.JSX.CSSProperties}
              onClick={() => void repo.updateAppointment(id, { serviceId: s.id })}>{s.name}</button>
          ))}
        </div>
      )}
      <div class="row"><span class="value">{formatWhen(appt.start)}</span></div>
      <div class="row"><span class="label">{t('appt.status')}</span><span class="value" data-testid="appt-status">{status}</span></div>
      <input ref={picker} type="datetime-local" step={900} value={appt.start} data-testid="move-input" class={inline ? 'move-input inline' : 'move-input'}
        onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) { closeSheet(); void moveWithToast(id, snap(v)); } }} />
      <div class="actions-list">
        {appt.status === 'booked' && <button class="action-row" data-testid="act-move" onClick={openMove}>{t('act.move')}</button>}
        {appt.status === 'booked' && past && <button class="action-row" data-testid="act-noshow" onClick={after(() => noShowWithToast(id))}>{t('act.noshow')}</button>}
        {appt.status === 'booked' && <button class="action-row destructive" data-testid="act-cancel" onClick={() => { closeSheet(); confirmCancel(id); }}>{t('act.cancelAppt')}</button>}
        {appt.status !== 'booked' && <button class="action-row" data-testid="act-restore" onClick={after(() => restoreWithToast(id))}>{t('act.restore')}</button>}
      </div>
    </Sheet>
  );
}
```
Note: `Perkelti` calls `closeSheet()` only after a value is chosen. `act-cancel` closes the sheet and opens the action sheet in the same tick.

`src/ui/components/Sheets.tsx`:
```tsx
import { ActionSheet } from './ActionSheet';
import { AppointmentSheet } from './AppointmentSheet';
import { NewSheet } from './NewSheet';
import { ToastHost } from './Toast';
import { ui, useStore } from '../store';

export function Sheets() {
  const { sheet } = useStore(ui);
  return (
    <>
      {sheet?.type === 'new' && <NewSheet key={`${sheet.start}${sheet.clientId ?? ''}`} prefill={sheet} />}
      {sheet?.type === 'appt' && <AppointmentSheet key={sheet.id} id={sheet.id} />}
      <ActionSheet />
      <ToastHost />
    </>
  );
}
```

Append to `src/styles.css`:
```css
.link-name { font-size: 1.3rem; font-weight: 600; margin: .4rem 0 .6rem; text-align: left; color: var(--blue); }
p.link-name { color: var(--label); }
.actions-list { margin-top: 1rem; background: var(--card); border-radius: .7rem; overflow: hidden; }
.action-row { display: block; width: 100%; text-align: left; padding: 0 .9rem; border-top: .5px solid var(--sep); color: var(--blue); }
.action-row:first-child { border-top: 0; }
.destructive { color: var(--red); }
.move-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.move-input.inline { position: static; width: 100%; height: auto; opacity: 1; pointer-events: auto; margin-top: .6rem; }
.action-root { z-index: 30; }
.actions { position: relative; width: 100%; padding: 0 .5rem calc(.5rem + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: .5rem; animation: rise .3s ease-out; }
.action-group { background: var(--card); border-radius: .9rem; overflow: hidden; }
.action-title { text-align: center; font-size: .8rem; color: var(--label2); margin: .6rem 0; }
.action { display: block; width: 100%; min-height: 52px; border-top: .5px solid var(--sep); color: var(--blue); font-size: 1.1rem; }
.action.cancel { background: var(--card); border-radius: .9rem; font-weight: 600; border-top: 0; }
.toast { position: fixed; left: .8rem; right: .8rem; bottom: calc(4.4rem + env(safe-area-inset-bottom)); z-index: 40; display: flex; justify-content: space-between; align-items: center; gap: .6rem;
  background: rgba(40,40,44,.96); color: #fff; padding: .2rem .9rem; border-radius: .9rem; font-size: .9rem; animation: rise .25s ease-out; }
.toast button { color: #64b5ff; font-weight: 600; }
```

- [ ] **Step 5: Run** `npm run typecheck && npm run lint && npm test && npm run e2e` → PASS.

- [ ] **Step 6: Commit, push, PR (M4)**
```bash
git add -A && git commit -m "feat: add appointment sheet, action sheet, toast and undo"
git push -u origin m4-appointment
gh pr create --title "M4: appointment sheet" --body "Open, change service, Perkelti, Neatvyko, Atšaukti vizitą with optional reason, Atkurti vizitą, undo toast. Perkelti uses showPicker() with an inline datetime input as fallback; check on device.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

## M5 – Long-press drag

**Done when:** drag and scroll e2e tests pass and a long-press never opens the iOS text callout.

### Task 12: Drag logic, gesture binding, ghost

**Files:**
- Create: `src/logic/drag.ts`, `src/ui/drag.ts`, `src/ui/components/DragGhost.tsx`
- Modify: `src/ui/components/EntryBlock.tsx`, `src/ui/components/TimelineGrid.tsx`, `src/ui/components/Sheets.tsx`, `src/styles.css`, `docs/architecture.md` (document auto-scroll)
- Test: `tests/unit/drag.test.ts`, `tests/e2e/drag.spec.ts`

**Interfaces:**
- Produces (`logic/drag.ts`):
```ts
const HOLD_MS = 400, MOVE_THRESHOLD_PX = 8, EDGE_ZONE_PX = 24, EDGE_HOLD_MS = 600, AUTOSCROLL_ZONE_PX = 40
exceedsThreshold(dx: number, dy: number): boolean
edgeSide(x: number, width: number): -1 | 0 | 1
startFromY(o: { date: string; rangeStartMin: number; rows: number; colTop: number; colHeight: number; y: number; grabDY: number }): string
```
- Produces (`ui/drag.ts`): `bindEntryDrag(el: HTMLElement, getEntry: () => Entry): () => void`.
- Consumes: `ui.drag`, `moveWithToast`, `[data-col-date][data-range-start][data-rows]` columns, `[data-chip-date]` week-strip chips (Task 8/9).

- [ ] **Step 1: Failing unit tests** — `tests/unit/drag.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { edgeSide, exceedsThreshold, HOLD_MS, MOVE_THRESHOLD_PX, startFromY } from '../../src/logic/drag';

const col = { date: '2026-10-14', rangeStartMin: 480, rows: 8, colTop: 100, colHeight: 400 }; // 50px per 15 min

describe('drag math', () => {
  it('uses the spec timings', () => { expect(HOLD_MS).toBe(400); expect(MOVE_THRESHOLD_PX).toBe(8); });
  it('treats movement over 8px as a scroll', () => {
    expect(exceedsThreshold(5, 5)).toBe(false);
    expect(exceedsThreshold(0, 9)).toBe(true);
  });
  it('snaps the dropped top edge to 15 minutes', () => {
    expect(startFromY({ ...col, y: 250, grabDY: 0 })).toBe('2026-10-14T08:45');
    expect(startFromY({ ...col, y: 261, grabDY: 0 })).toBe('2026-10-14T08:45');
    expect(startFromY({ ...col, y: 275, grabDY: 0 })).toBe('2026-10-14T09:00');
  });
  it('accounts for where the entry was grabbed', () => {
    expect(startFromY({ ...col, y: 270, grabDY: 20 })).toBe('2026-10-14T08:45');
  });
  it('clamps inside the visible range', () => {
    expect(startFromY({ ...col, y: -500, grabDY: 0 })).toBe('2026-10-14T08:00');
    expect(startFromY({ ...col, y: 5000, grabDY: 0 })).toBe('2026-10-14T09:45');
  });
  it('detects the screen edges', () => {
    expect(edgeSide(5, 430)).toBe(-1);
    expect(edgeSide(425, 430)).toBe(1);
    expect(edgeSide(200, 430)).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `npm test -- drag` → FAIL.

- [ ] **Step 3: Implement `src/logic/drag.ts`**

```ts
import { hhmm } from './time';

export const HOLD_MS = 400;
export const MOVE_THRESHOLD_PX = 8;
export const EDGE_ZONE_PX = 24;
export const EDGE_HOLD_MS = 600;
export const AUTOSCROLL_ZONE_PX = 40;

export const exceedsThreshold = (dx: number, dy: number) => Math.hypot(dx, dy) > MOVE_THRESHOLD_PX;
export const edgeSide = (x: number, width: number): -1 | 0 | 1 => (x < EDGE_ZONE_PX ? -1 : x > width - EDGE_ZONE_PX ? 1 : 0);

export function startFromY(o: { date: string; rangeStartMin: number; rows: number; colTop: number; colHeight: number; y: number; grabDY: number }): string {
  const rowPx = o.colHeight / o.rows;
  const raw = o.rangeStartMin + ((o.y - o.grabDY - o.colTop) / rowPx) * 15;
  const lo = o.rangeStartMin, hi = o.rangeStartMin + (o.rows - 1) * 15;
  const snapped = Math.min(hi, Math.max(lo, Math.round(raw / 15) * 15));
  return `${o.date}T${hhmm(snapped)}`;
}
```

- [ ] **Step 4: Run** `npm test -- drag` → PASS.

- [ ] **Step 5: Failing e2e** — `tests/e2e/drag.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

async function lift(page: Page, id: string) {
  const box = (await page.getByTestId(`entry-${id}`).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  return { x, y };
}
const rowHeight = async (page: Page) => {
  const a = (await page.getByTestId('slot-2026-10-14T10:00').boundingBox())!;
  const b = (await page.getByTestId('slot-2026-10-14T10:15').boundingBox())!;
  return b.y - a.y;
};

test('hold then drag snaps to 15 minutes, saves on release and Anuliuoti undoes it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const row = await rowHeight(page);
  const { x, y } = await lift(page, id);
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await page.mouse.move(x, y + 2 * row + 3, { steps: 8 });
  await expect(page.getByTestId('drag-ghost')).toContainText('10:30');
  await page.mouse.up();
  expect((await apptState(page, id)).start).toBe('2026-10-14T10:30');
  expect((await apptState(page, id)).moves).toHaveLength(1);
  await expect(page.getByTestId('toast')).toContainText('Perkelta: spalio 14 d., tr · 10:30');
  await page.getByTestId('toast-undo').click();
  expect((await apptState(page, id)).start).toBe('2026-10-14T10:00');
});

test('dropping on a week-strip chip changes the date and keeps the time', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const { x, y } = await lift(page, id);
  const chip = (await page.getByTestId('chip-2026-10-16').boundingBox())!;
  await page.mouse.move(x, y - 5, { steps: 3 });
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2, { steps: 10 });
  await page.mouse.up();
  expect((await apptState(page, id)).start).toBe('2026-10-16T10:00');
});

test('in Week view, dragging across columns changes the date', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('seg-week').click();
  const { x, y } = await lift(page, id);
  const target = (await page.getByTestId('col-2026-10-16').boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, y, { steps: 10 });
  await page.mouse.up();
  expect((await apptState(page, id)).start).toBe('2026-10-16T10:00');
  void x;
});

test('holding at the screen edge for 600 ms flips the day', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const { y } = await lift(page, id);
  await page.mouse.move(3, y, { steps: 6 });
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-13'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.mouse.move(200, y, { steps: 6 });
  await page.mouse.up();
  expect((await apptState(page, id)).start.slice(0, 10)).toBe('2026-10-13');
});

test('a quick swipe never starts a drag', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const box = (await page.getByTestId(`entry-${id}`).boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 70, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  expect((await apptState(page, id)).moves).toHaveLength(0);
});

test('a short tap still opens the appointment', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('sheet')).toBeVisible();
});

test('a drag does not also open the sheet', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const row = await rowHeight(page);
  const { x, y } = await lift(page, id);
  await page.mouse.move(x, y + row, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
});

test('entries disable the iOS text callout and selection', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const css = await page.getByTestId(`entry-${id}`).evaluate((el) => {
    const s = getComputedStyle(el) as CSSStyleDeclaration & { webkitTouchCallout?: string };
    return { callout: s.webkitTouchCallout, select: s.userSelect };
  });
  expect(css.select).toBe('none');
  expect(css.callout ?? 'none').toBe('none');
});
```

- [ ] **Step 6: Run** `npm run e2e -- drag` → FAIL.

- [ ] **Step 7: Gesture binding** — `src/ui/drag.ts`:

```ts
import type { Entry } from '../db/repo';
import { AUTOSCROLL_ZONE_PX, EDGE_HOLD_MS, edgeSide, exceedsThreshold, HOLD_MS, startFromY } from '../logic/drag';
import { addDays, timePart } from '../logic/time';
import { moveWithToast } from './actions';
import { ui } from './store';

/** Long-press (400 ms) then drag. Listeners live on the entry element so the gesture survives day flips
 *  (TimelineGrid keeps this element mounted while a drag is active). */
export function bindEntryDrag(el: HTMLElement, getEntry: () => Entry): () => void {
  let timer = 0, edgeTimer = 0, raf = 0;
  let pid = -1, sx = 0, sy = 0, lx = 0, ly = 0, grabDY = 0, side = 0;
  let lifted = false, justDragged = false;

  const clearTimers = () => { clearTimeout(timer); clearTimeout(edgeTimer); cancelAnimationFrame(raf); side = 0; };
  const reset = () => { clearTimers(); pid = -1; lifted = false; ui.set({ drag: null }); };

  function target(): { date: string; start: string } | null {
    const hit = document.elementFromPoint(lx, ly) as HTMLElement | null;
    if (!hit) return null;
    const entry = getEntry();
    const chip = hit.closest<HTMLElement>('[data-chip-date]');
    if (chip) return { date: chip.dataset.chipDate!, start: `${chip.dataset.chipDate}T${timePart(entry.appt.start)}` };
    const col = hit.closest<HTMLElement>('[data-col-date]');
    if (!col) return null;
    const r = col.getBoundingClientRect();
    const date = col.dataset.colDate!;
    const start = startFromY({ date, rangeStartMin: +col.dataset.rangeStart!, rows: +col.dataset.rows!, colTop: r.top, colHeight: r.height, y: ly, grabDY });
    return { date, start };
  }
  function update() {
    const d = ui.get().drag;
    if (!d) return;
    const over = target();
    ui.set({ drag: { ...d, x: lx, y: ly, over, label: over ? over.start : d.entry.appt.start } });
  }
  function armEdge() {
    const s = ui.get().view === 'day' ? edgeSide(lx, window.innerWidth) : 0;
    if (s === side) return;
    clearTimeout(edgeTimer);
    side = s;
    if (!s) return;
    const flip = () => {
      ui.set({ date: addDays(ui.get().date, s) });
      edgeTimer = window.setTimeout(flip, EDGE_HOLD_MS);
    };
    edgeTimer = window.setTimeout(flip, EDGE_HOLD_MS);
  }
  function loop() {
    const sc = el.closest<HTMLElement>('.grid-scroll');
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (ly < r.top + AUTOSCROLL_ZONE_PX) sc.scrollTop -= 8;
      else if (ly > r.bottom - AUTOSCROLL_ZONE_PX) sc.scrollTop += 8;
    }
    update();
    raf = requestAnimationFrame(loop);
  }
  function lift() {
    const entry = getEntry();
    const r = el.getBoundingClientRect();
    lifted = true;
    grabDY = sy - r.top;
    try { el.setPointerCapture(pid); } catch { /* pointer already gone */ }
    ui.set({ drag: { entry, label: entry.appt.start, x: lx, y: ly, grabDY, left: r.left, width: r.width, over: null } });
    update();
    loop();
  }

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (getEntry().appt.status === 'cancelled') return;
    pid = e.pointerId; sx = lx = e.clientX; sy = ly = e.clientY; lifted = false; justDragged = false;
    timer = window.setTimeout(lift, HOLD_MS);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    lx = e.clientX; ly = e.clientY;
    if (!lifted) {
      if (exceedsThreshold(lx - sx, ly - sy)) { clearTimeout(timer); pid = -1; } // a scroll, not a drag
      return;
    }
    armEdge();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    if (!lifted) { clearTimers(); pid = -1; return; }
    const d = ui.get().drag;
    const entry = getEntry();
    reset();
    justDragged = true;
    if (d?.over && d.over.start !== entry.appt.start) void moveWithToast(entry.appt.id, d.over.start);
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    if (lifted) reset();
    else { clearTimers(); pid = -1; }
  };
  const touchMove = (e: TouchEvent) => { if (lifted) e.preventDefault(); };
  const click = (e: MouseEvent) => { if (justDragged) { e.stopImmediatePropagation(); e.preventDefault(); justDragged = false; } };
  const noMenu = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('touchmove', touchMove, { passive: false });
  el.addEventListener('click', click, true);
  el.addEventListener('contextmenu', noMenu);
  return () => {
    clearTimers();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('touchmove', touchMove);
    el.removeEventListener('click', click, true);
    el.removeEventListener('contextmenu', noMenu);
  };
}
```

`src/ui/components/DragGhost.tsx`:
```tsx
import { formatWhen } from '../../i18n/format';
import { ui, useStore } from '../store';

export function DragGhost() {
  const { drag } = useStore(ui);
  if (!drag) return null;
  return (
    <div class="drag-ghost" data-testid="drag-ghost" style={{ left: `${drag.left}px`, top: `${drag.y - drag.grabDY}px`, width: `${drag.width}px`, '--svc': `var(--c-${drag.entry.color})` } as preact.JSX.CSSProperties}>
      <b>{drag.entry.label}</b>
      <span>{formatWhen(drag.label)}</span>
    </div>
  );
}
```

- [ ] **Step 8: Wire it in**

`EntryBlock.tsx`: add a ref and effect (add `useEffect, useRef` imports from `preact/hooks`, and `bindEntryDrag` from `../drag`):
```tsx
const ref = useRef<HTMLButtonElement>(null);
const latest = useRef(e);
latest.current = e;
useEffect(() => (ref.current ? bindEntryDrag(ref.current, () => latest.current) : undefined), []);
```
and add `ref={ref}` to the `<button>`. Add prop `anchor?: boolean`; when true add class `anchor` (hidden, see CSS).

`TimelineGrid.tsx`: import `ui, useStore`. Inside the component add `const { drag } = useStore(ui);`. In the per-date render, after `dayEntries.map(...)`, add the anchor so the dragged element stays mounted when the day flips:
```tsx
{dates.length === 1 && drag && !dayEntries.some((e) => e.appt.id === drag.entry.appt.id) && (
  <EntryBlock key={drag.entry.appt.id} e={drag.entry} startMin={startMin} col={0} cols={1} compact={false} anchor />
)}
```

`Sheets.tsx`: render `<DragGhost />` inside the fragment.

Append to `src/styles.css`:
```css
.entry.anchor { visibility: hidden; pointer-events: none; }
.drag-ghost { position: fixed; z-index: 50; pointer-events: none; box-sizing: border-box; padding: .3rem .5rem; border-radius: .5rem; border-left: 4px solid var(--svc);
  background: color-mix(in srgb, var(--svc) 28%, var(--card)); box-shadow: 0 8px 24px rgba(0,0,0,.35); transform: scale(1.03); display: flex; flex-direction: column; }
.drag-ghost span { font-size: .8rem; color: var(--label2); }
```

Spec update in `docs/architecture.md` → under "Reschedule (long-press and drag)" add step 6: "While dragging, holding within 40 px of the top or bottom edge of the timeline scrolls it."

- [ ] **Step 9: Run** `npm run typecheck && npm run lint && npm test && npm run e2e` → PASS. WebKit emulation drives pointer events via the mouse; the real-touch behaviour (iOS cancels pointer events when it starts scrolling) is covered by the manual checks below.

- [ ] **Step 10: Commit, push, PR (M5)**
```bash
git add -A && git commit -m "feat: add long-press drag to reschedule"
git push -u origin m5-drag
gh pr create --title "M5: long-press drag" --body "Hold 400 ms, 8 px scroll threshold, 15-min snap, week-strip and cross-column drops, edge flip, moves history. Departure from spec: vertical auto-scroll near the timeline edges (spec updated). Needs on-device verification.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 11: Manual device checks (owner)**
  - [ ] Holding an entry lifts it; no text callout, magnifier or selection appears.
  - [ ] A quick swipe over an entry scrolls the timeline and never lifts it.
  - [ ] Dragging scrolls nothing except the near-edge auto-scroll; dropping saves and shows the undo toast.
  - [ ] Holding at the left or right screen edge flips the day and the drag continues; dropping saves on the new day.
  - [ ] Dropping on a week-strip chip moves the entry to that day at the same time.
