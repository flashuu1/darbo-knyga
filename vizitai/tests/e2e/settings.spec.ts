import { test, expect } from '@playwright/test';
import { openApp, seedAppts, openSettings } from './helpers';

const counts = (page: import('@playwright/test').Page) => page.evaluate(async () => {
  const { db } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { c: await db.clients.count(), a: await db.appointments.count(), s: await db.services.count() };
});

test('renames a service and the new name appears in the booking sheet', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'services');
  await page.getByTestId('svc-name-0').fill('Moteriškas kirpimas');
  await page.getByTestId('svc-name-0').blur();
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('field-name').press('Enter');
  await expect(page.getByTestId('svc-0')).toContainText('Moteriškas kirpimas');
});

test('hiding a service removes its chip but keeps old appointment labels', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00', service: 1 }]);
  await openSettings(page, 'services');
  await page.getByTestId('svc-toggle-1').click();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId(`entry-${id}`)).toContainText('Dažymas');
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('field-name').press('Enter');
  await expect(page.getByTestId('svc-1')).not.toHaveText('Dažymas');
});

test('the last active service cannot be hidden', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'services');
  for (let i = 1; i < 6; i++) await page.getByTestId(`svc-toggle-${i}`).click();
  await page.getByTestId('svc-toggle-0').click();
  await expect(page.getByTestId('toast')).toHaveText(/Turi likti bent viena paslauga/);
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('field-name').press('Enter');
  await expect(page.getByTestId('svc-0')).toBeVisible();
});

test('reorders, recolours, changes length and adds a service', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'services');
  const second = await page.getByTestId('svc-name-1').inputValue();
  await page.getByTestId('svc-up-1').click();
  await expect(page.getByTestId('svc-name-0')).toHaveValue(second);
  await expect(page.getByTestId('svc-minutes-0')).toHaveText('15'); // the default length
  await expect(page.getByTestId('svc-minus-0')).toBeDisabled(); // never below 15
  await page.getByTestId('svc-plus-0').click();
  await page.getByTestId('svc-plus-0').click();
  await page.getByTestId('svc-minus-0').click();
  await expect(page.getByTestId('svc-minutes-0')).toHaveText('30');
  await page.getByTestId('svc-swatch-0').click();
  await page.getByTestId('svc-color-0-teal').click();
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.listServices())[0])).toMatchObject({ color: 'teal', minutes: 30 }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('svc-add').click();
  await expect(page.getByTestId('svc-row-6')).toBeVisible();
});

test('working hours change the timeline range and reject an end before the start', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'hours');
  await page.getByTestId('hours-start').fill('09:00');
  await page.getByTestId('hours-start').dispatchEvent('change'); // WebKit fill() fires input, not change
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.getSettings()).dayStart)).toBe('09:00'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('hours-end').fill('07:00');
  await page.getByTestId('hours-end').dispatchEvent('change');
  await expect(page.getByTestId('toast')).toHaveText(/Pabaiga turi būti vėlesnė už pradžią/);
  await expect(page.getByTestId('hours-end')).toHaveValue('20:00'); // input reverted
  await page.getByTestId('tab-calendar').click();
  // one hour of shaded padding before the working day: 08:00 is shown outside hours, 07:45 is gone
  await expect(page.getByTestId('slot-2026-10-14T07:45')).toHaveCount(0);
  await expect(page.getByTestId('slot-2026-10-14T08:00')).toHaveClass(/(^| )off( |$)/);
  await expect(page.getByTestId('slot-2026-10-14T08:45')).toHaveClass(/(^| )off( |$)/);
  await expect(page.getByTestId('slot-2026-10-14T09:00')).not.toHaveClass(/(^| )off( |$)/);
  await expect(page.getByTestId('slot-2026-10-14T19:45')).not.toHaveClass(/(^| )off( |$)/);
  await expect(page.getByTestId('slot-2026-10-14T20:00')).toHaveClass(/(^| )off( |$)/);
});

test('export, clear, import gives identical records', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-25T10:00' }, { name: 'Ona', start: '2026-10-26T11:15' }]);
  const before = await counts(page);
  await openSettings(page, 'backup');
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
  await openSettings(page, 'backup');
  await page.getByTestId('import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('garbage') });
  await expect(page.getByTestId('toast')).toHaveText(/Netinkamas failas/);
  await expect(page.getByTestId('action-title')).toHaveCount(0);
  expect(await counts(page)).toEqual(before);
});

test('a file from a newer app version is refused', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'backup');
  const body = JSON.stringify({ app: 'vizitai', schemaVersion: 999, exportedAt: '', clients: [], appointments: [], services: [], settings: [] });
  await page.getByTestId('import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(body) });
  await expect(page.getByTestId('toast')).toHaveText(/naujesnės programos versijos/);
});

test('a dismissed share sheet does not mark the backup as done', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'backup');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => { (window as any).__shared = true; throw new DOMException('x', 'AbortError'); }, configurable: true }); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  await page.getByTestId('btn-export').click();
  await page.waitForFunction(() => (window as any).__shared === true); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.waitForTimeout(300);
  await expect(page.getByTestId('backup-last')).toHaveText('Kopijos dar nėra');
  expect(await page.evaluate(async () => (await (window as any).__vizitai.repo.getSettings()).lastBackupAt)).toBeNull(); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('shows the storage status and app version', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'about');
  await expect(page.getByTestId('storage-status')).toHaveText(/Duomenys/);
  await expect(page.getByTestId('app-version')).toContainText('Versija: ');
  // build row: "Sukurta: 2026 m. spalio 14 d. 15:42 · abc1234" (id is the short commit hash, or 'dev')
  await expect(page.getByTestId('app-build')).toHaveText(/^Sukurta: \d{4} m\. \p{L}+ \d{1,2} d\. \d{2}:\d{2} · [0-9a-z]+$/u);
  const id = (await page.getByTestId('app-build').textContent())!.split(' · ').pop()!;
  expect(id.length).toBeGreaterThan(0);
});

test('a blank service name reverts to the stored name', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'services');
  const before = await page.getByTestId('svc-name-0').inputValue();
  await page.getByTestId('svc-name-0').fill('   ');
  await page.getByTestId('svc-name-0').blur();
  await expect(page.getByTestId('svc-name-0')).toHaveValue(before);
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.listServices())[0].name)).toBe(before); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('colour swatches have 44pt touch targets', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'services');
  await page.getByTestId('svc-swatch-0').click();
  for (const id of ['svc-swatch-0', 'svc-color-0-teal', 'svc-color-0-red']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('a failed export shows an error and does not mark the backup as done', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'backup');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => { throw new Error('boom'); }, configurable: true });
  });
  await page.getByTestId('btn-export').click();
  await expect(page.getByTestId('toast')).toHaveText(/Nepavyko sukurti kopijos/);
  await expect(page.getByTestId('backup-last')).toHaveText('Kopijos dar nėra');
  expect(await page.evaluate(async () => (await (window as any).__vizitai.repo.getSettings()).lastBackupAt)).toBeNull(); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('working hours snap to the 15-minute grid (iOS ignores step)', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'hours');
  const dayStart = () => page.evaluate(async () => (await (window as any).__vizitai.repo.getSettings()).dayStart); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('hours-start').fill('09:07');
  await page.getByTestId('hours-start').dispatchEvent('change');
  await expect.poll(dayStart).toBe('09:00');
  await expect(page.getByTestId('hours-start')).toHaveValue('09:00');
  await page.getByTestId('hours-start').fill('08:08');
  await page.getByTestId('hours-start').dispatchEvent('change');
  await expect.poll(dayStart).toBe('08:15');
  await expect(page.getByTestId('hours-start')).toHaveValue('08:15');
  await page.getByTestId('hours-start').fill('08:22'); // snaps to the value already stored: the field must not keep 08:22
  await page.getByTestId('hours-start').dispatchEvent('change');
  await expect(page.getByTestId('hours-start')).toHaveValue('08:15');
  await expect.poll(dayStart).toBe('08:15');
});

test('Nustatymai is a list of categories, like iOS, and each opens its own page with a way back', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  for (const id of ['services', 'hours', 'personal', 'expenses', 'backup', 'about']) await expect(page.getByTestId(`settings-row-${id}`)).toBeVisible();
  await expect(page.getByTestId('settings-value-services')).toHaveText('6'); // a short value on the row
  await expect(page.getByTestId('settings-value-hours')).toHaveText('08:00–20:00');
  await expect(page.getByTestId('svc-row-0')).toHaveCount(0); // the details are not on the list itself
  await page.getByTestId('settings-row-services').click();
  await expect(page.getByTestId('settings-page-services')).toBeVisible();
  await expect(page.getByTestId('svc-row-0')).toBeVisible();
  await expect(page.getByTestId('settings-back')).toContainText('Nustatymai');
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('settings-page-services')).toHaveCount(0);
  await expect(page.getByTestId('settings-row-services')).toBeVisible();
});

test('a swipe from the left edge goes back to the list of Nustatymai', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'hours');
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="settings-page-hours"]')!;
    const fire = (type: string, x: number, y: number) => {
      const tt = { identifier: 1, target: el, clientX: x, clientY: y };
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(ev, { touches: type === 'touchend' ? [] : [tt], changedTouches: [tt] });
      el.dispatchEvent(ev);
    };
    fire('touchstart', 8, 400); fire('touchmove', 60, 402); fire('touchend', 140, 404);
  });
  await expect(page.getByTestId('settings-page-hours')).toHaveCount(0);
});

test('the backup row shows the last backup and a red dot when one is due', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-20T10:00' }]);
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('settings-badge-backup')).toBeVisible(); // data but never backed up
  await expect(page.getByTestId('settings-value-backup')).toHaveText('Kopijos dar nėra');
  await page.getByTestId('settings-row-backup').click();
  await expect(page.getByTestId('btn-export')).toBeVisible();
});
