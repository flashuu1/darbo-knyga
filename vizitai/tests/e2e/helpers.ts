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
