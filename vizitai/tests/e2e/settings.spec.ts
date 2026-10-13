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
  await expect(page.getByTestId('svc-minutes-0')).toHaveText('15'); // the default length
  await page.getByTestId('svc-minus-0').click();
  await expect(page.getByTestId('svc-minutes-0')).toHaveText('15'); // never below 15
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
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('hours-start').fill('09:00');
  await page.getByTestId('hours-start').dispatchEvent('change'); // WebKit fill() fires input, not change
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.getSettings()).dayStart)).toBe('09:00'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('hours-end').fill('07:00');
  await page.getByTestId('hours-end').dispatchEvent('change');
  await expect(page.getByTestId('toast')).toHaveText(/Pabaiga turi būti vėlesnė už pradžią/);
  await expect(page.getByTestId('hours-end')).toHaveValue('20:00'); // input reverted
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
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('storage-status')).toHaveText(/Duomenys/);
  await expect(page.getByTestId('app-version')).toContainText('Versija: ');
  // build row: "Sukurta: 2026 m. spalio 14 d. 15:42 · abc1234" (id is the short commit hash, or 'dev')
  await expect(page.getByTestId('app-build')).toHaveText(/^Sukurta: \d{4} m\. \p{L}+ \d{1,2} d\. \d{2}:\d{2} · [0-9a-z]+$/u);
  const id = (await page.getByTestId('app-build').textContent())!.split(' · ').pop()!;
  expect(id.length).toBeGreaterThan(0);
});

test('a blank service name reverts to the stored name', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  const before = await page.getByTestId('svc-name-0').inputValue();
  await page.getByTestId('svc-name-0').fill('   ');
  await page.getByTestId('svc-name-0').blur();
  await expect(page.getByTestId('svc-name-0')).toHaveValue(before);
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.listServices())[0].name)).toBe(before); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('colour swatches have 44pt touch targets', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('svc-swatch-0').click();
  for (const id of ['svc-swatch-0', 'svc-color-0-teal', 'svc-color-0-red']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('a failed export shows an error and does not mark the backup as done', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
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
  await page.getByTestId('tab-settings').click();
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
