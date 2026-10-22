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
/** Opens a page of Nustatymai (the list of categories, then the chosen page). */
export async function openSettings(page: Page, section: 'services' | 'hours' | 'personal' | 'expenses' | 'backup' | 'about') {
  await page.getByTestId('tab-settings').click();
  await page.getByTestId(`settings-row-${section}`).click();
  await expect(page.getByTestId(`settings-page-${section}`)).toBeVisible();
  await page.waitForTimeout(450); // the page has slid in
}
/** Gives the list of expense kinds some entries (it starts empty; Asmeninis already has its common words). */
export async function seedOptions(page: Page) {
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const n of ['Medžiagos', 'Nuoma', 'Mokesčiai', 'Kita']) await repo.addOption('expense', n);
  });
}
export const apptState = (page: Page, id: string) =>
  page.evaluate((x) => (window as any).__vizitai.repo.getAppointment(x), id); // eslint-disable-line @typescript-eslint/no-explicit-any

/** Sets the time wheels of the calendar picker (tapping a number). */
export async function pickTime(page: Page, hm: string) {
  await page.getByTestId(`wheel-h-${hm.slice(0, 2)}`).click();
  await page.getByTestId(`wheel-m-${hm.slice(3, 5)}`).click();
}
/** The wheels show `hm` as the picked time. */
export async function expectPickedTime(page: Page, hm: string) {
  await expect(page.getByTestId(`wheel-h-${hm.slice(0, 2)}`)).toHaveClass(/on/);
  await expect(page.getByTestId(`wheel-m-${hm.slice(3, 5)}`)).toHaveClass(/on/);
}
