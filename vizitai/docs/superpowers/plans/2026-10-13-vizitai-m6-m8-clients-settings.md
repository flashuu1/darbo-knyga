# M6 – M8: Clients, Settings, first suggestions

Read the index first. Branches: `m6-clients`, `m7-settings`, `m8-suggestions` (each from updated `main`, one PR each). Commands run in `vizitai/`. **After M8 stop and review with the owner; M9 (suggestions 4–7) is agreed with the owner first.**

## M6 – Clients

**Done when:** search and sort tests pass.

### Task 13: Clients list, search and client card

**Files:**
- Create: `src/ui/status.ts`, `src/ui/screens/Clients.tsx`, `src/ui/screens/ClientCard.tsx`
- Modify: `src/app.tsx`, `src/ui/components/Sheets.tsx`, `src/ui/components/AppointmentSheet.tsx`, `src/styles.css`
- Test: `tests/e2e/clients.spec.ts`

**Interfaces:**
- Consumes: `repo.listClients`, `repo.clientDetail`, `repo.updateClient`, `repo.defaultStartFor`, `foldName`, `openNew`, `openAppt`, `ui.client`.
- Produces: `statusLabel(a: Appointment, now?: string): string`; `ClientsScreen()`; `ClientCard({ id })` (full-screen overlay driven by `ui.client`).
- Test ids: `client-search`, `client-row-<n>`, `clients-empty`, `card-name`, `card-phone`, `card-visits`, `card-cancelled`, `card-noshow`, `card-book`, `card-back`, `visit-<n>`.

- [ ] **Step 1: Failing e2e** — `tests/e2e/clients.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

const names = [{ name: 'Žydrūnė', start: '2026-10-01T10:00' }, { name: 'Zita', start: '2026-10-02T10:00' }, { name: 'Ona', start: '2026-10-03T10:00' }];

test('lists clients sorted with lt rules and shows the last visit', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, names);
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('client-row-0')).toContainText('Ona');
  await expect(page.getByTestId('client-row-1')).toContainText('Zita');
  await expect(page.getByTestId('client-row-2')).toContainText('Žydrūnė');
  await expect(page.getByTestId('client-row-0')).toContainText('Paskutinis vizitas: spalio 3 d.');
});

test('search ignores diacritics and case', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, names);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-search').fill('ZYDRUNE');
  await expect(page.getByTestId('client-row-0')).toContainText('Žydrūnė');
  await expect(page.getByTestId('client-row-1')).toHaveCount(0);
});

test('shows an empty state with no clients', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('clients-empty')).toHaveText('Klientų dar nėra');
});

test('the card shows visits and counts, and saves name and phone', async ({ page }) => {
  await openApp(page);
  const [a, b] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T10:00' }, { name: 'Ona', start: '2026-10-05T10:00' }, { name: 'Ona', start: '2026-10-20T10:00' }]);
  await page.evaluate(async (id) => (window as any).__vizitai.repo.cancelAppointment(id, 'ill'), b); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.evaluate(async (id) => (window as any).__vizitai.repo.markNoShow(id), a); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  await expect(page.getByTestId('card-visits')).toHaveText('Vizitų skaičius: 0');
  await expect(page.getByTestId('card-cancelled')).toHaveText('Atšaukė: 1');
  await expect(page.getByTestId('card-noshow')).toHaveText('Neatvyko: 1');
  await expect(page.getByTestId('visit-0')).toBeVisible();
  await page.getByTestId('card-phone').fill('+370 600 00000');
  await page.getByTestId('card-name').fill('Ona Onaitė');
  await page.getByTestId('card-back').click();
  await expect(page.getByTestId('client-row-0')).toContainText('Ona Onaitė');
  const phone = await page.evaluate(async () => (await (window as any).__vizitai.db.clients.toArray())[0].phone); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(phone).toBe('+370 600 00000');
});

test('Registruoti opens the new sheet with the client and their last service', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T10:00', service: 2 }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  await page.getByTestId('card-book').click();
  await expect(page.getByTestId('field-name')).toHaveValue('Ona');
  await expect(page.getByTestId('svc-2')).toHaveClass(/on/);
});

test('tapping the name in an appointment opens the client card', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('appt-name').click();
  await expect(page.getByTestId('card-name')).toHaveValue('Ona');
});
```

- [ ] **Step 2: Run** `npm run e2e -- clients` → FAIL.

- [ ] **Step 3: Implement**

`src/ui/status.ts`:
```ts
import type { Appointment } from '../db/types';
import { t } from '../i18n/lt';
import { nowLocal } from '../logic/time';

export function statusLabel(a: Appointment, now: string = nowLocal()): string {
  if (a.status === 'cancelled') return t('status.cancelled');
  if (a.status === 'noshow') return t('status.noshow');
  return a.start < now ? t('status.done') : t('status.booked');
}
```
In `AppointmentSheet.tsx` replace the inline `status` computation with `const status = statusLabel(appt);` (keep `past` for the Neatvyko rule; drop the unused `done`).

`src/ui/screens/Clients.tsx`:
```tsx
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
```

`src/ui/screens/ClientCard.tsx`:
```tsx
import { repo } from '../../db/repo';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { openAppt, openNew } from '../actions';
import { useLive } from '../hooks';
import { statusLabel } from '../status';
import { ui } from '../store';

export function ClientCard({ id }: { id: string }) {
  const d = useLive(() => repo.clientDetail(id), [id], null);
  if (!d) return null;
  const book = async () => {
    const start = await repo.defaultStartFor(ui.get().date);
    ui.set({ client: null, tab: 'calendar', view: 'day' });
    openNew(start, { clientId: id });
  };
  const visit = (e: (typeof d.upcoming)[number], n: number, prefix: string) => (
    <li key={e.appt.id}>
      <button data-testid={`${prefix}-${n}`} onClick={() => openAppt(e.appt.id)}>
        <span>{formatWhen(e.appt.start)}</span>
        <span>{e.service?.name ?? ''} {statusLabel(e.appt)}</span>
      </button>
    </li>
  );
  return (
    <div class="card-root" data-testid="client-card">
      <header class="navbar">
        <button class="nav-btn" data-testid="card-back" onClick={() => ui.set({ client: null })}>{t('nav.back')}</button>
        <button class="nav-btn strong" data-testid="card-book" onClick={() => void book()}>{t('client.book')}</button>
      </header>
      <div class="card-body">
        <input class="field name" key={`n${d.client.id}`} data-testid="card-name" defaultValue={d.client.name}
          onChange={(e) => void repo.updateClient(id, { name: (e.target as HTMLInputElement).value })} />
        <label class="row"><span class="label">{t('client.phone')}</span>
          <input class="inline" type="tel" data-testid="card-phone" defaultValue={d.client.phone ?? ''}
            onChange={(e) => void repo.updateClient(id, { phone: (e.target as HTMLInputElement).value })} />
        </label>
        <p class="stat" data-testid="card-visits">{t('client.visitCount', { n: d.visitCount })}</p>
        <p class="stat" data-testid="card-cancelled">{t('client.cancelledCount', { n: d.cancelled })}</p>
        <p class="stat" data-testid="card-noshow">{t('client.noshowCount', { n: d.noshow })}</p>
        <p class="label">{t('client.upcoming')}</p>
        <ul class="visits">{d.upcoming.length ? d.upcoming.map((e, n) => visit(e, n, 'upcoming')) : <li class="muted">{t('client.none')}</li>}</ul>
        <p class="label">{t('client.past')}</p>
        <ul class="visits">{d.past.length ? d.past.map((e, n) => visit(e, n, 'visit')) : <li class="muted">{t('client.none')}</li>}</ul>
      </div>
    </div>
  );
}
```
The card renders every ancestor `useLive` result with `key` on inputs so a rename elsewhere refreshes them.

`src/ui/components/Sheets.tsx`: add `import { ClientCard } from '../screens/ClientCard';` and render `{client && <ClientCard id={client} />}` before the sheets (read `client` from `useStore(ui)`).

`src/app.tsx`: render `{tab === 'calendar' ? <CalendarScreen /> : tab === 'clients' ? <ClientsScreen /> : <h1 class="large-title">{t('tab.settings')}</h1>}`.

Append to `src/styles.css`:
```css
.clients { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.searchbar { padding: 0 1rem .5rem; }
.searchbar input { width: 100%; box-sizing: border-box; border: 0; border-radius: .6rem; padding: .55rem .8rem; background: var(--fill); }
.client-list, .visits { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.client-list { flex: 1; background: var(--card); }
.client-list button, .visits button { display: flex; flex-direction: column; align-items: flex-start; width: 100%; padding: .4rem 1rem; border-bottom: .5px solid var(--sep); text-align: left; }
.client-list span, .visits span { font-size: .8rem; color: var(--label2); }
.empty-note, .muted { text-align: center; color: var(--label2); padding: 1rem; list-style: none; }
.card-root { position: fixed; inset: 0; z-index: 10; background: var(--bg); display: flex; flex-direction: column; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
.card-body { overflow-y: auto; padding: 0 1rem 2rem; }
.field.name { font-size: 1.4rem; font-weight: 600; }
.row .inline { border: 0; background: transparent; text-align: right; flex: 1; }
.stat { margin: .3rem 0; }
.nav-btn.strong { font-weight: 600; }
```

- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test && npm run e2e` → PASS.

- [ ] **Step 5: Commit, push, PR (M6)**
```bash
git add -A && git commit -m "feat: add clients list, search and client card"
git push -u origin m6-clients
gh pr create --title "M6: clients" --body "Clients list sorted with Intl.Collator('lt'), diacritic-insensitive search, client card, Registruoti.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

## M7 – Settings

**Done when:** the export → clear → import round trip works on the device.

### Task 14: Settings screen

**Files:**
- Create: `src/ui/screens/Settings.tsx`
- Modify: `src/db/types.ts` (add `SERVICE_COLORS`), `src/ui/actions.ts` (`runBackup`, `chooseImport`), `src/app.tsx`, `src/styles.css`, `docs/architecture.md`
- Test: `tests/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `repo` service/settings functions, `exportData`, `parseBackup`, `importData`, `shareBackup`, `backupFileName`, `BackupError`, `ui.action`, `showToast`.
- Produces (`types.ts`): `export const SERVICE_COLORS: ServiceColor[] = ['blue','green','indigo','orange','pink','purple','red','teal','yellow','gray']`.
- Produces (`actions.ts`): `runBackup(): Promise<void>` (does nothing on a dismissed share sheet, otherwise stamps `lastBackupAt`); `chooseImport(file: File): Promise<void>` (validates first, then asks for confirmation).
- Test ids: `svc-row-<n>`, `svc-name-<n>`, `svc-up-<n>`, `svc-down-<n>`, `svc-toggle-<n>`, `svc-minus-<n>`, `svc-plus-<n>`, `svc-minutes-<n>`, `svc-color-<n>-<color>`, `svc-add`, `hours-start`, `hours-end`, `btn-export`, `btn-import`, `import-input`, `storage-status`, `backup-last`, `app-version`.

- [ ] **Step 1: Failing e2e** — `tests/e2e/settings.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

const counts = (page: import('@playwright/test').Page) => page.evaluate(async () => {
  const { db } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { c: await db.clients.count(), a: await db.appointments.count(), s: await db.services.count() };
});

test('renames a service and the new name appears in the booking sheet', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('svc-name-0').fill('Moteriškas kirpimas');
  await page.getByTestId('svc-name-0').blur();
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await expect(page.getByTestId('svc-0')).toHaveText('Moteriškas kirpimas');
});

test('hiding a service removes its chip but keeps old appointment labels', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00', service: 1 }]);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('svc-toggle-1').click();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId(`entry-${id}`)).toContainText('Dažymas');
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await expect(page.getByTestId('svc-1')).not.toHaveText('Dažymas');
});

test('the last active service cannot be hidden', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  for (let i = 1; i < 6; i++) await page.getByTestId(`svc-toggle-${i}`).click();
  await page.getByTestId('svc-toggle-0').click();
  await expect(page.getByTestId('toast')).toHaveText(/Turi likti bent viena paslauga/);
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await expect(page.getByTestId('svc-0')).toBeVisible();
});

test('reorders, recolours, changes length and adds a service', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  const second = await page.getByTestId('svc-name-1').inputValue();
  await page.getByTestId('svc-up-1').click();
  await expect(page.getByTestId('svc-name-0')).toHaveValue(second);
  await page.getByTestId('svc-minus-0').click();
  await expect(page.getByTestId('svc-minutes-0')).toHaveText('75');
  await page.getByTestId('svc-color-0-teal').click();
  const svc = await page.evaluate(async () => (await (window as any).__vizitai.repo.listServices())[0]); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(svc).toMatchObject({ color: 'teal', minutes: 75 });
  await page.getByTestId('svc-add').click();
  await expect(page.getByTestId('svc-row-6')).toBeVisible();
});

test('working hours change the timeline range and reject an end before the start', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('hours-start').fill('09:00');
  await page.getByTestId('hours-end').fill('07:00');
  await expect(page.getByTestId('toast')).toHaveText(/Pabaiga turi būti vėlesnė už pradžią/);
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('slot-2026-10-14T08:00')).toHaveCount(0);
  await expect(page.getByTestId('slot-2026-10-14T09:00')).toHaveCount(1);
});

test('export, clear, import gives identical records', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-25T10:00' }, { name: 'Ona', start: '2026-10-26T11:15' }]);
  const before = await counts(page);
  await page.getByTestId('tab-settings').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-export').click()]);
  const file = await download.path();
  await expect(page.getByTestId('backup-last')).not.toHaveText('Kopijos dar nėra');
  await page.evaluate(async () => {
    const { db } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    await Promise.all([db.clients.clear(), db.appointments.clear(), db.services.clear(), db.settings.clear()]);
  });
  await page.getByTestId('import-input').setInputFiles(file!);
  await page.getByTestId('action-item-0').click(); // Pakeisti
  await expect(page.getByTestId('toast')).toHaveText(/Duomenys atkurti/);
  expect(await counts(page)).toEqual(before);
});

test('a wrong file shows an error and leaves the data untouched', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const before = await counts(page);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('garbage') });
  await expect(page.getByTestId('toast')).toHaveText(/Netinkamas failas/);
  await expect(page.getByTestId('action-title')).toHaveCount(0);
  expect(await counts(page)).toEqual(before);
});

test('a file from a newer app version is refused', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  const body = JSON.stringify({ app: 'vizitai', schemaVersion: 999, exportedAt: '', clients: [], appointments: [], services: [], settings: [] });
  await page.getByTestId('import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(body) });
  await expect(page.getByTestId('toast')).toHaveText(/naujesnės programos versijos/);
});

test('a dismissed share sheet does not mark the backup as done', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('x', 'AbortError'); }, configurable: true });
  });
  await page.getByTestId('btn-export').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('backup-last')).toHaveText('Kopijos dar nėra');
  expect(await page.evaluate(async () => (await (window as any).__vizitai.repo.getSettings()).lastBackupAt)).toBeNull(); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('shows the storage status and app version', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('storage-status')).toHaveText(/Duomenys/);
  await expect(page.getByTestId('app-version')).toContainText('Versija: ');
});
```

- [ ] **Step 2: Run** `npm run e2e -- settings` → FAIL.

- [ ] **Step 3: Implement**

`src/db/types.ts` — append: `export const SERVICE_COLORS: ServiceColor[] = ['blue', 'green', 'indigo', 'orange', 'pink', 'purple', 'red', 'teal', 'yellow', 'gray'];`

`src/ui/actions.ts` — append (imports: `db` from `../db/db`; `backupFileName, BackupError, exportData, importData, parseBackup, shareBackup, type BackupFile` from `../logic/backup`):
```ts
export async function runBackup() {
  const json = JSON.stringify(await exportData(db));
  const result = await shareBackup(json, backupFileName());
  if (result === 'cancelled') return; // share sheet dismissed: nothing was saved
  await repo.updateSettings({ lastBackupAt: new Date().toISOString() });
  showToast(t('backup.exported'));
}
async function doImport(file: BackupFile) {
  await importData(db, file);
  showToast(t('backup.imported'));
}
export async function chooseImport(file: File) {
  let parsed: BackupFile;
  try { parsed = parseBackup(await file.text()); } catch (e) {
    showToast(t(e instanceof BackupError && e.code === 'newer' ? 'backup.error.newer' : 'backup.error.format'));
    return; // nothing was touched
  }
  ui.set({ action: { title: t('backup.confirm'), items: [
    { label: t('backup.replace'), role: 'destructive', onPress: () => void doImport(parsed) },
    { label: t('btn.dismiss'), role: 'cancel', onPress: () => {} },
  ] } });
}
```

`src/ui/screens/Settings.tsx`:
```tsx
import { useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { SERVICE_COLORS } from '../../db/types';
import { formatDayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { todayStr } from '../../logic/time';
import { chooseImport, runBackup, showToast } from '../actions';
import { useServices, useSettings } from '../hooks';

export function SettingsScreen() {
  const settings = useSettings();
  const services = useServices(false);
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const file = useRef<HTMLInputElement>(null);

  async function toggle(id: string, active: boolean) {
    try { await repo.setServiceActive(id, active); } catch { showToast(t('service.lastActive')); }
  }
  async function setHour(field: 'dayStart' | 'dayEnd', v: string) {
    if (!v) return;
    const next = { ...settings, [field]: v };
    if (next.dayStart >= next.dayEnd) { showToast(t('hours.invalid')); setTick((x) => x + 1); return; }
    await repo.updateSettings({ [field]: v });
  }
  const last = settings.lastBackupAt ? t('backup.last', { data: formatDayShort(todayStr(new Date(settings.lastBackupAt))) }) : t('backup.never');

  return (
    <section class="settings" data-testid="settings">
      <h1 class="large-title">{t('tab.settings')}</h1>
      <div class="settings-body">
        <p class="label">{t('settings.services')}</p>
        <ul class="svc-list">
          {services.map((s, i) => (
            <li key={s.id} data-testid={`svc-row-${i}`} class={s.active ? '' : 'hidden-svc'}>
              <div class="svc-line">
                <button class="swatch" style={{ background: `var(--c-${s.color})` }} data-testid={`svc-swatch-${i}`} onClick={() => setOpenColor(openColor === s.id ? null : s.id)} />
                <input class="inline" data-testid={`svc-name-${i}`} defaultValue={s.name} key={`${s.id}${s.name}`}
                  onChange={(e) => void repo.updateService(s.id, { name: (e.target as HTMLInputElement).value })} />
                <button data-testid={`svc-up-${i}`} onClick={() => void repo.moveService(s.id, -1)}>↑</button>
                <button data-testid={`svc-down-${i}`} onClick={() => void repo.moveService(s.id, 1)}>↓</button>
              </div>
              <div class="svc-line sub">
                <span class="label">{t('service.minutes')}</span>
                <button data-testid={`svc-minus-${i}`} onClick={() => void repo.updateService(s.id, { minutes: Math.max(15, s.minutes - 15) })}>−</button>
                <span data-testid={`svc-minutes-${i}`}>{s.minutes}</span>
                <button data-testid={`svc-plus-${i}`} onClick={() => void repo.updateService(s.id, { minutes: Math.min(240, s.minutes + 15) })}>+</button>
                <button class="toggle" data-testid={`svc-toggle-${i}`} onClick={() => void toggle(s.id, !s.active)}>{s.active ? t('service.hide') : t('service.show')}</button>
              </div>
              {openColor === s.id && (
                <div class="svc-line swatches">
                  {SERVICE_COLORS.map((c) => (
                    <button key={c} class="swatch" style={{ background: `var(--c-${c})` }} data-testid={`svc-color-${i}-${c}`}
                      onClick={() => { void repo.updateService(s.id, { color: c }); setOpenColor(null); }} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        <button class="action-row" data-testid="svc-add" onClick={() => void repo.addService(t('service.new'))}>{t('service.add')}</button>

        <p class="label">{t('settings.hours')}</p>
        <div class="row"><span class="label">{t('hours.start')}</span>
          <input class="inline" type="time" step={900} key={`s${settings.dayStart}${tick}`} defaultValue={settings.dayStart} data-testid="hours-start" onChange={(e) => void setHour('dayStart', (e.target as HTMLInputElement).value)} /></div>
        <div class="row"><span class="label">{t('hours.end')}</span>
          <input class="inline" type="time" step={900} key={`e${settings.dayEnd}${tick}`} defaultValue={settings.dayEnd} data-testid="hours-end" onChange={(e) => void setHour('dayEnd', (e.target as HTMLInputElement).value)} /></div>

        <p class="label">{t('settings.backup')}</p>
        <p class="muted-left" data-testid="backup-last">{last}</p>
        <div class="actions-list">
          <button class="action-row" data-testid="btn-export" onClick={() => void runBackup()}>{t('backup.export')}</button>
          <button class="action-row" data-testid="btn-import" onClick={() => file.current?.click()}>{t('backup.import')}</button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-input"
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) void chooseImport(f); }} />

        <p class="label">{t('settings.storage')}</p>
        <p class="muted-left" data-testid="storage-status">{settings.persistGranted ? t('storage.persistent') : t('storage.notPersistent')}</p>
        <p class="muted-left" data-testid="app-version">{t('settings.version')}: {__APP_VERSION__}</p>
      </div>
    </section>
  );
}
```

`src/app.tsx`: use `<SettingsScreen />` for the settings tab.

Append to `src/styles.css`:
```css
.settings { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.settings-body { overflow-y: auto; padding: 0 1rem 2rem; }
.svc-list { list-style: none; margin: 0 0 .5rem; padding: 0; background: var(--card); border-radius: .7rem; overflow: hidden; }
.svc-list li { padding: .3rem .8rem; border-top: .5px solid var(--sep); }
.svc-list li:first-child { border-top: 0; }
.svc-line { display: flex; align-items: center; gap: .5rem; }
.svc-line.sub { font-size: .85rem; }
.svc-line .inline { flex: 1; border: 0; background: transparent; text-align: left; }
.svc-line.swatches { flex-wrap: wrap; padding: .3rem 0; }
.swatch { width: 28px; height: 28px; min-width: 28px; min-height: 28px; border-radius: 50%; border: 0; }
.hidden-svc { opacity: .5; }
.toggle { margin-left: auto; color: var(--blue); }
.muted-left { color: var(--label2); margin: .2rem 0 .6rem; }
```
(Swatch buttons override the 44 px minimum on purpose; they sit in a row with 44 px high neighbours. If on-device testing shows mis-taps, wrap them in 44 px hit areas.)

Spec edits in `docs/architecture.md`: Settings row → "Services (add, rename, reorder, colour, length in minutes, hide), working hours, backup export and import, storage status, app version." Data model rule 2 → "...It never appears in a booking form (it is edited only in Settings)."

- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test && npm run e2e` → PASS. If WebKit exposes a working `navigator.canShare`, the export test's `waitForEvent('download')` will time out; in that case stub `navigator.canShare = () => false` in the test before clicking.

- [ ] **Step 5: Commit, push, PR (M7)**
```bash
git add -A && git commit -m "feat: add Settings with services, hours, backup and storage status"
git push -u origin m7-settings
gh pr create --title "M7: settings" --body "Services editor (spec extension: add service and length stepper; spec updated), working hours, JSON backup via share sheet with download fallback, import with validation and confirmation, storage status.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 6: Manual device checks (owner)**
  - [ ] Export opens the iOS share sheet; save to Files; dismissing the sheet does not update "Paskutinė kopija".
  - [ ] Wipe by importing a backup in the Home Screen app: records match (round trip works on the device).
  - [ ] Settings shows the persistence result, and the services editor is usable at the largest iOS text size.

## M8 – Suggestions 1–3

**Done when:** covered by e2e tests.

### Task 15: Backup reminder, one-tap rebooking, smart-default coverage

**Files:**
- Modify: `src/logic/backup.ts` (add `needsBackup`), `src/ui/actions.ts` (add `repeatFrom`), `src/ui/screens/Calendar.tsx`, `src/ui/components/TabBar.tsx`, `src/ui/components/AppointmentSheet.tsx`, `src/ui/screens/ClientCard.tsx`, `src/styles.css`
- Test: `tests/unit/needs-backup.test.ts`, `tests/e2e/suggestions.spec.ts`

**Interfaces:**
- Produces: `needsBackup(lastBackupAt: string | null, hasData: boolean, now?: Date): boolean` (true when there is data and the last backup is missing or older than 7 days); `repeatFrom(e: { start: string; clientId: string | null; serviceId: string | null }): void` (opens the "Kartoti po" action sheet with 4/6/8 weeks; each choice opens the new sheet for the same client and service, same weekday and time).
- Test ids: `backup-banner`, `tab-settings-badge`, `act-repeat`, `card-repeat`.

- [ ] **Step 1: Failing unit test** — `tests/unit/needs-backup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { needsBackup } from '../../src/logic/backup';

const now = new Date('2026-10-14T12:00:00Z');
describe('needsBackup', () => {
  it('is false when there is no data yet', () => expect(needsBackup(null, false, now)).toBe(false));
  it('is true when there is data and no backup', () => expect(needsBackup(null, true, now)).toBe(true));
  it('is false within 7 days', () => expect(needsBackup('2026-10-08T12:00:01Z', true, now)).toBe(false));
  it('is true after 7 days', () => expect(needsBackup('2026-10-07T11:59:59Z', true, now)).toBe(true));
});
```

- [ ] **Step 2: Run** `npm test -- needs-backup` → FAIL.

- [ ] **Step 3: Implement** — append to `src/logic/backup.ts`:

```ts
const WEEK_MS = 7 * 24 * 3600 * 1000;
export function needsBackup(lastBackupAt: string | null, hasData: boolean, now: Date = new Date()): boolean {
  if (!hasData) return false;
  if (!lastBackupAt) return true;
  return now.getTime() - new Date(lastBackupAt).getTime() > WEEK_MS;
}
```
Add to `src/ui/hooks.ts`: `export const useNeedsBackup = (): boolean => useLive(async () => needsBackup((await repo.getSettings()).lastBackupAt, (await db.appointments.count()) > 0), [], false);` (imports: `needsBackup` from `../logic/backup`, `db` from `../db/db`).

- [ ] **Step 4: Run** `npm test -- needs-backup` → PASS.

- [ ] **Step 5: Failing e2e** — `tests/e2e/suggestions.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

test('the backup banner shows when data exists but no backup, and opens the export', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('backup-banner')).toHaveCount(0); // no data yet
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await expect(page.getByTestId('backup-banner')).toHaveText('Sukurti atsarginę kopiją?');
  await expect(page.getByTestId('tab-settings-badge')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-banner').click()]);
  expect(download.suggestedFilename()).toMatch(/^vizitai-2026-10-14\.json$/);
  await expect(page.getByTestId('backup-banner')).toHaveCount(0);
  await expect(page.getByTestId('tab-settings-badge')).toHaveCount(0);
});

test('Kartoti on an appointment books the same client and service 6 weeks later', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00', service: 2 }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-repeat').click();
  await expect(page.getByTestId('action-title')).toHaveText('Kartoti po');
  await expect(page.getByTestId('action-item-0')).toHaveText('po 4 sav.');
  await page.getByTestId('action-item-1').click(); // 6 weeks
  await expect(page.getByTestId('field-name')).toHaveValue('Ona');
  await expect(page.getByTestId('svc-2')).toHaveClass(/on/);
  await expect(page.getByTestId('time-value')).toHaveText('lapkričio 25 d., tr · 10:00');
  await page.getByTestId('btn-save').click();
  const n = await page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).filter((a: { start: string }) => a.start === '2026-11-25T10:00').length); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(n).toBe(1);
});

test('Kartoti on the client card repeats the latest visit', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T09:30', service: 1 }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  await page.getByTestId('card-repeat').click();
  await page.getByTestId('action-item-2').click(); // 8 weeks
  await expect(page.getByTestId('time-value')).toHaveText('lapkričio 26 d., kt · 09:30'); // 2026-10-01 + 56 days (Thursday)
  await expect(page.getByTestId('svc-1')).toHaveClass(/on/);
});

test('smart defaults: the next free slot skips today’s booking, recent clients come first, last service is preselected', async ({ page }) => {
  await openApp(page, '2026-10-14T09:05:00');
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }, { name: 'Jonas', start: '2026-10-13T10:00', service: 3 }]);
  await page.getByTestId('btn-add').click();
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().sheet.start)).toBe('2026-10-14T09:45'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('suggest-0')).toHaveText('Jonas');
  await page.getByTestId('suggest-0').click();
  await expect(page.getByTestId('svc-3')).toHaveClass(/on/);
});
```
Date check: 2026-10-14 + 42 days = 2026-11-25 (Wednesday, "tr"); 2026-10-01 + 56 days = 2026-11-26 (Thursday, "kt").

- [ ] **Step 6: Run** `npm run e2e -- suggestions` → FAIL.

- [ ] **Step 7: Implement**

`src/ui/actions.ts` — append:
```ts
export function repeatFrom(e: { start: string; clientId: string | null; serviceId: string | null }) {
  if (!e.clientId) return;
  const weeks = [4, 6, 8];
  ui.set({
    action: {
      title: t('repeat.title'),
      items: [
        ...weeks.map((n) => ({
          label: t('repeat.weeks', { n }),
          onPress: () => openNew(`${addDays(datePart(e.start), 7 * n)}T${timePart(e.start)}`, { clientId: e.clientId!, serviceId: e.serviceId ?? undefined }),
        })),
        { label: t('btn.dismiss'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}
```
(add `addDays` to the `../logic/time` import).

`AppointmentSheet.tsx`: inside `actions-list`, before the destructive row, add for `appt.kind === 'client'`:
```tsx
{appt.kind === 'client' && <button class="action-row" data-testid="act-repeat" onClick={() => { closeSheet(); repeatFrom(appt); }}>{t('repeat.action')}</button>}
```
`ClientCard.tsx`: add a button next to the stats, using the latest non-cancelled visit:
```tsx
const latest = [...d.upcoming, ...d.past].filter((e) => e.appt.status !== 'cancelled').sort((a, b) => b.appt.start.localeCompare(a.appt.start))[0];
{latest && <button class="action-row" data-testid="card-repeat" onClick={() => repeatFrom(latest.appt)}>{t('repeat.action')}</button>}
```
`Calendar.tsx`: above the timeline add
```tsx
const stale = useNeedsBackup();
{stale && <button class="banner" data-testid="backup-banner" onClick={() => void runBackup()}>{t('backup.banner')}</button>}
```
`TabBar.tsx`: `const stale = useNeedsBackup();` and inside the settings tab button add `{id === 'settings' && stale && <span class="badge" data-testid="tab-settings-badge" />}`.

Append to `src/styles.css`:
```css
.banner { display: block; width: 100%; background: color-mix(in srgb, var(--blue) 14%, var(--card)); color: var(--blue); text-align: center; min-height: 40px; border-bottom: .5px solid var(--sep); }
.tab { position: relative; }
.badge { position: absolute; top: 6px; left: calc(50% + 8px); width: 10px; height: 10px; border-radius: 50%; background: var(--red); }
```

- [ ] **Step 8: Run** `npm run typecheck && npm run lint && npm test && npm run e2e` → all PASS. Run `npm run build && npm run scan:bundle` → clean.

- [ ] **Step 9: Commit, push, PR (M8)**
```bash
git add -A && git commit -m "feat: add backup reminder, one-tap rebooking and smart-default tests"
git push -u origin m8-suggestions
gh pr create --title "M8: suggestions 1–3" --body "Backup reminder (banner + Settings badge), Kartoti 4/6/8 weeks on appointment and client card, e2e coverage for smart defaults. Banner appears only once data exists.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 10: Final acceptance pass (owner, on her iPhone)** — run through every item under "Acceptance criteria and test plan → On the device (by hand)" in `docs/architecture.md`, plus: install-screen wording matches the real Share menu; keyboard opens on the new sheet; date/time picker snaps to 15 min; largest iOS text size stays usable. Report results before starting M9.
