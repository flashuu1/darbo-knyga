import { test, expect, type Page } from '@playwright/test';
import { openApp, seedAppts, openSettings, openRow } from './helpers';

const counts = (page: import('@playwright/test').Page) => page.evaluate(async () => {
  const { db } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { c: await db.clients.count(), a: await db.appointments.count(), s: await db.services.count() };
});

test('renames a service and the new name appears in the booking sheet', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'services');
  await openRow(page, 'svc', 0);
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
  await openRow(page, 'svc', 1);
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
  for (let i = 1; i < 7; i++) { await openRow(page, 'svc', i); await page.getByTestId(`svc-toggle-${i}`).click(); }
  await openRow(page, 'svc', 0);
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
  await openRow(page, 'svc', 1);
  const second = await page.getByTestId('svc-name-1').inputValue();
  await page.getByTestId('svc-up-1').click();
  await expect(page.getByTestId('svc-name-0')).toHaveValue(second);
  await openRow(page, 'svc', 0);
  await expect(page.getByTestId('svc-minutes-0')).toHaveText('15 min'); // the default length
  await expect(page.getByTestId('svc-minus-0')).toBeDisabled(); // never below 15
  await page.getByTestId('svc-plus-0').click();
  await page.getByTestId('svc-plus-0').click();
  await page.getByTestId('svc-minus-0').click();
  await expect(page.getByTestId('svc-minutes-0')).toHaveText('30 min');
  await page.getByTestId('svc-color-0-teal').click();
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.listServices())[0])).toMatchObject({ color: 'teal', minutes: 30 }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('svc-add').click();
  await expect(page.getByTestId('svc-row-7')).toBeVisible();
  await expect(page.getByTestId('svc-open-7')).toHaveAttribute('aria-expanded', 'true'); // the new one opens with the cursor in its name
  await expect(page.getByTestId('svc-name-7')).toBeFocused();
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
  await openRow(page, 'svc', 0);
  const before = await page.getByTestId('svc-name-0').inputValue();
  await page.getByTestId('svc-name-0').fill('   ');
  await page.getByTestId('svc-name-0').blur();
  await expect(page.getByTestId('svc-name-0')).toHaveValue(before);
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.listServices())[0].name)).toBe(before); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('colour swatches have 44pt touch targets', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'services');
  await openRow(page, 'svc', 0);
  for (const id of ['svc-color-0-teal', 'svc-color-0-red', 'svc-up-0', 'svc-down-0', 'svc-delete-0', 'svc-minus-0', 'svc-plus-0']) {
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
  await expect(page.getByTestId('settings-value-services')).toHaveText('7'); // a short value on the row
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

test('swiping a Nustatymai page to the right: it follows the finger, springs back when short, goes back when long', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'hours');
  const pg = page.getByTestId('settings-page-hours');
  await page.waitForTimeout(500); // the page's own entrance is over
  const x = () => pg.evaluate((el) => el.getBoundingClientRect().x);
  await page.mouse.move(70, 620);
  await page.mouse.down();
  await page.mouse.move(110, 622, { steps: 4 });
  await page.mouse.move(190, 624, { steps: 4 });
  expect(Math.round(await x())).toBeGreaterThan(90); // mid-drag the page is already moving with the finger
  expect(Math.round(await x())).toBeLessThan(140);
  await page.mouse.move(110, 624, { steps: 4 });
  expect(Math.round(await x())).toBeLessThan(60); // and it follows back
  await page.mouse.up(); // a short drag: springs back
  await page.waitForTimeout(600);
  expect(Math.round(await x())).toBe(0);
  await expect(pg).toBeVisible();
  await page.mouse.move(70, 620);
  await page.mouse.down();
  await page.mouse.move(250, 622, { steps: 8 });
  await page.mouse.up(); // a long drag: goes back
  await expect(pg).toHaveCount(0);
  await expect(page.getByTestId('settings-row-hours')).toBeVisible();
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

test('Apie programą has the changelog: the running build on top and highlighted, older builds below in a box that scrolls', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'about');
  const build = (await page.getByTestId('app-build').textContent())!;
  const cur = page.getByTestId('changelog-current');
  await expect(cur).toBeVisible();
  // the newest entry carries the same build id as the one shown above it
  const id = (await cur.getByTestId('changelog-build').textContent())!;
  expect(build).toContain(id);
  await expect(cur).toContainText('Ši versija');
  await expect(cur.getByTestId('changelog-date')).not.toHaveText('');
  // above the older entries
  const c = (await cur.boundingBox())!, o = (await page.getByTestId('changelog-older').boundingBox())!;
  expect(c.y).toBeLessThan(o.y);
  // three kinds of change, with their own words
  const kinds = await page.getByTestId('changelog-older').getByTestId('changelog-kind').allTextContents();
  expect(new Set(kinds)).toEqual(new Set(['Klaidos taisymas', 'Pakeitimas', 'Naujiena']));
  // older ones are smaller and tighter, and the box scrolls
  const sizes = await page.evaluate(() => [
    parseFloat(getComputedStyle(document.querySelector('[data-testid="changelog-current"] .cl-text')!).fontSize),
    parseFloat(getComputedStyle(document.querySelector('[data-testid="changelog-older"] .cl-text')!).fontSize),
  ]);
  expect(sizes[0]).toBeGreaterThan(sizes[1]!);
  const scroll = await page.getByTestId('changelog-older').evaluate((el) => ({ scrollable: el.scrollHeight > el.clientHeight, overflow: getComputedStyle(el).overflowY }));
  expect(scroll).toEqual({ scrollable: true, overflow: 'auto' });
  // an older entry shows its own build id
  const olderId = await page.getByTestId('changelog-older').getByTestId('changelog-build').first().textContent();
  expect(olderId).toMatch(/^[0-9a-f]{7}$/);
});

test('Darbo laikas: the weekdays she works can be switched, at least one stays on, and it is saved', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'hours');
  for (let i = 0; i < 7; i++) await expect(page.getByTestId(`work-day-${i}`)).toHaveAttribute('aria-pressed', 'true'); // every day to begin with
  await page.getByTestId('work-day-6').click(); // Sekmadienis
  await page.getByTestId('work-day-0').click(); // Pirmadienis
  await expect(page.getByTestId('work-day-6')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.getSettings()).workDays)).toEqual([1, 2, 3, 4, 5]); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const i of [1, 2, 3, 4]) await page.getByTestId(`work-day-${i}`).click();
  await page.getByTestId('work-day-5').click(); // the last one cannot be switched off
  await expect(page.getByTestId('work-day-5')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.getSettings()).workDays)).toEqual([5]); // eslint-disable-line @typescript-eslint/no-explicit-any
});

/* eslint-disable @typescript-eslint/no-explicit-any */
test.describe('copies of the books kept in the app', () => {
  const exportNow = async (page: Page) => { await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-export').click()]); await expect(page.getByTestId('toast')).toHaveText(/Kopija sukurta/); };
  const plus = (page: Page, name: string) => seedAppts(page, [{ name, start: '2026-10-20T10:00' }]);
  const counts2 = (page: Page) => page.evaluate(async () => { const { db } = (window as any).__vizitai; return { c: await db.clients.count(), a: await db.appointments.count() }; });

  test('the last three exports are listed, newest first; the one that matches the books is marked; unchanged books are not exported twice', async ({ page }) => {
    await openApp(page);
    await plus(page, 'Ona');
    await openSettings(page, 'backup');
    await expect(page.getByTestId('snap-none')).toBeVisible();
    await exportNow(page);
    await expect(page.getByTestId('snap-export-0')).toContainText('Klientų: 1 · vizitų: 1');
    await expect(page.getByTestId('snap-match-export-0')).toBeVisible();
    await expect(page.getByTestId('backup-last')).toContainText('Duomenys nepakito');
    // nothing changed: it asks first, and a "no" keeps things as they are
    await page.getByTestId('btn-export').click();
    await expect(page.getByTestId('action-title')).toContainText('Duomenys nepakito');
    await page.getByTestId('action-item-1').click();
    await expect(page.getByTestId('snap-export-1')).toHaveCount(0);
    // changed books: a second copy, and now the newest one is the one that matches
    await plus(page, 'Rasa');
    await expect(page.getByTestId('snap-match-export-0')).toHaveCount(0);
    await exportNow(page);
    await expect(page.getByTestId('snap-export-1')).toBeVisible();
    await expect(page.getByTestId('snap-export-0')).toContainText('Klientų: 2 · vizitų: 2');
    await expect(page.getByTestId('snap-match-export-0')).toBeVisible();
    await expect(page.getByTestId('snap-match-export-1')).toHaveCount(0);
    await plus(page, 'Zita'); await exportNow(page);
    await plus(page, 'Gabija'); await exportNow(page);
    await expect(page.getByTestId('snap-export-2')).toBeVisible();
    await expect(page.getByTestId('snap-export-3')).toHaveCount(0); // only the last three
    await expect(page.getByTestId('snap-export-0')).toContainText('Klientų: 4');
  });

  test('tapping a copy asks to restore it, restores it, and the toast can undo that', async ({ page }) => {
    await openApp(page);
    await plus(page, 'Ona');
    await openSettings(page, 'backup');
    await exportNow(page);
    await plus(page, 'Rasa'); await exportNow(page);
    await plus(page, 'Zita'); // three clients now, the newest copy has two
    expect(await counts2(page)).toEqual({ c: 3, a: 3 });
    await page.getByTestId('snap-export-0').click();
    await expect(page.getByTestId('action-title')).toHaveText('Atkurti duomenis iš šios kopijos?');
    await expect(page.getByTestId('action-lines')).toContainText('Klientų: 2 · vizitų: 2');
    await page.getByTestId('action-item-0').click();
    await expect(page.getByTestId('toast')).toContainText('Duomenys atkurti');
    expect(await counts2(page)).toEqual({ c: 2, a: 2 });
    await page.getByTestId('toast-undo').click(); // back to the three
    await expect.poll(() => counts2(page)).toEqual({ c: 3, a: 3 });
    // the safety copy it used is in the second list
    await expect(page.getByTestId('snap-auto-0')).toContainText('Prieš atkuriant');
  });

  test('a copy, or a file, that holds exactly the current books says there is nothing to restore', async ({ page }) => {
    await openApp(page);
    await plus(page, 'Ona');
    await openSettings(page, 'backup');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-export').click()]);
    const file = await download.path();
    await expect(page.getByTestId('snap-match-export-0')).toBeVisible();
    await page.getByTestId('snap-export-0').click();
    await expect(page.getByTestId('toast')).toContainText('jau tokie patys');
    await expect(page.getByTestId('action-title')).toHaveCount(0);
    await page.getByTestId('import-input').setInputFiles(file!);
    await expect(page.getByTestId('toast')).toContainText('jau tokie patys');
    await expect(page.getByTestId('action-title')).toHaveCount(0);
  });

  test('the banner stays away while the books are exactly what the last export holds, even when that export is old', async ({ page }) => {
    await openApp(page);
    await plus(page, 'Ona');
    await openSettings(page, 'backup');
    await exportNow(page);
    await page.evaluate(() => (window as any).__vizitai.repo.updateSettings({ lastBackupAt: '2026-09-01T09:00:00.000Z' }));
    await page.getByTestId('settings-back').click();
    await page.getByTestId('tab-calendar').click();
    await expect(page.getByTestId('backup-banner')).toHaveCount(0); // unchanged since that export
    await plus(page, 'Rasa'); // now there is something that is not in any export
    await expect(page.getByTestId('backup-banner')).toBeVisible();
  });

  test('the app also keeps a copy by itself, once a day, when the books have changed', async ({ page }) => {
    await openApp(page);
    await plus(page, 'Ona');
    await page.waitForTimeout(3600); // the daily check runs a few seconds after the app opens
    await openSettings(page, 'backup');
    await expect(page.getByTestId('snap-auto-0')).toContainText('Klientų: 1 · vizitų: 1');
    await expect(page.getByTestId('snap-match-auto-0')).toBeVisible();
  });
});
