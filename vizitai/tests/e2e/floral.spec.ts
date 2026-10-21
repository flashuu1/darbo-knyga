import { test, expect } from '@playwright/test';
import { openApp, openSettings } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const wedding = (page: any) => page.evaluate(async () => (await (window as any).__vizitai.repo.listServices(true)).find((s: any) => s.name === 'Vestuvės'));
const book = (page: any, start: string, svcName: string, name = 'Gintarė') => page.evaluate(async ([st, sn, nm]: string[]) => {
  const { repo } = (window as any).__vizitai;
  const s = (await repo.listServices(true)).find((x: any) => x.name === sn);
  return (await repo.createAppointment({ kind: 'client', name: nm, serviceId: s.id, start: st })).id;
}, [start, svcName, name]);

test('Vestuvės is one of the services: long, pink, and marked with flowers', async ({ page }) => {
  await openApp(page);
  expect(await wedding(page)).toMatchObject({ minutes: 240, color: 'pink', floral: true });
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await page.getByTestId('field-name').fill('Gintarė');
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('svc-5')).toContainText('Vestuvės');
  await expect(page.getByTestId('svc-5')).toContainText('🌸');
  await page.getByTestId('svc-5').click();
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  const [a] = await page.evaluate(async () => (window as any).__vizitai.db.appointments.toArray());
  const e = page.getByTestId(`entry-${a.id}`);
  await expect(e).toContainText('Vestuvės');
  const slot = (await page.getByTestId('slot-2026-10-14T10:00').boundingBox())!, box = (await e.boundingBox())!;
  expect(Math.round(box.height / slot.height)).toBe(16); // four hours
});

test('flowers drift up while a floral visit is coming up; when its payment is due it glows orange AND has flowers; once paid, neither', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  const coming = await book(page, '2026-10-14T15:00', 'Vestuvės');
  const past = await book(page, '2026-10-14T08:00', 'Vestuvės', 'Rasa');
  const plain = await book(page, '2026-10-14T16:00', 'Kirpimas', 'Ona');
  // coming up: flowers, no glow
  await expect(page.getByTestId(`bloom-${coming}`)).toBeAttached();
  await expect(page.getByTestId(`entry-${coming}`)).not.toHaveClass(/entry--due/);
  expect(await page.getByTestId(`bloom-${coming}`).locator('i').count()).toBe(5);
  expect(await page.getByTestId(`bloom-${coming}`).locator('i').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('bloom-up');
  // its time has passed and the money is missing: the orange glow and the flowers
  await expect(page.getByTestId(`bloom-${past}`)).toBeAttached();
  await expect(page.getByTestId(`entry-${past}`)).toHaveClass(/entry--due/);
  await expect(page.locator('.entry-glow')).toHaveCount(1);
  // an ordinary visit never gets flowers
  await expect(page.getByTestId(`bloom-${plain}`)).toHaveCount(0);
  // paid: no glow and no flowers
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 90000), past);
  await expect(page.getByTestId(`bloom-${past}`)).toHaveCount(0);
  await expect(page.locator('.entry-glow')).toHaveCount(0);
  // cancelled: no flowers either
  await page.evaluate(async (x) => (window as any).__vizitai.repo.cancelAppointment(x, null), coming);
  await expect(page.getByTestId(`bloom-${coming}`)).toHaveCount(0);
});

test('the flowers are a switch per service in Paslaugos, and any service can have them', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  const id = await book(page, '2026-10-14T15:00', 'Kirpimas', 'Ona');
  await expect(page.getByTestId(`bloom-${id}`)).toHaveCount(0);
  await openSettings(page, 'services');
  await expect(page.getByTestId('svc-floral-5')).toHaveAttribute('aria-checked', 'true'); // Vestuvės
  await expect(page.getByTestId('svc-floral-0')).toHaveAttribute('aria-checked', 'false'); // Kirpimas
  await page.getByTestId('svc-floral-0').click();
  await expect(page.getByTestId('svc-floral-0')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('settings-back').click();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId(`bloom-${id}`)).toBeAttached();
  await openSettings(page, 'services');
  await page.getByTestId('svc-floral-5').click(); // switch the wedding's flowers off
  await expect.poll(async () => (await wedding(page)).floral).toBeFalsy();
  expect((await wedding(page)).minutes).toBe(240); // only the flowers changed
});

test('a service can be made long: half-hour steps from two hours, up to fourteen hours', async ({ page }) => {
  await openApp(page);
  await openSettings(page, 'services');
  await expect(page.getByTestId('svc-minutes-5')).toHaveText('240');
  await page.getByTestId('svc-plus-5').click();
  await expect(page.getByTestId('svc-minutes-5')).toHaveText('270');
  await page.getByTestId('svc-minus-5').click();
  await page.getByTestId('svc-minus-5').click();
  await expect(page.getByTestId('svc-minutes-5')).toHaveText('210');
  await page.getByTestId('svc-plus-1').click(); // short services still go in quarter hours
  await expect(page.getByTestId('svc-minutes-1')).toHaveText('30');
});

test('the glow and the flowers are there at every zoom and scale with the entry as she pinches in and out', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  const due = await book(page, '2026-10-14T08:00', 'Vestuvės', 'Rasa'); // four hours, waiting for its payment: glow and flowers
  const quick = await book(page, '2026-10-14T10:00', 'Kirpimas', 'Ona');
  await page.evaluate(async () => { const { repo } = (window as any).__vizitai; const s = (await repo.listServices(true)).find((x: any) => x.name === 'Kirpimas'); await repo.updateService(s.id, { floral: true }); });
  const look = async (id: string) => page.evaluate((x) => {
    const bloom = document.querySelector(`[data-testid="bloom-${x}"]`) as HTMLElement | null;
    const glow = [...document.querySelectorAll<HTMLElement>('.entry-glow')];
    const petal = bloom?.querySelector('i') as HTMLElement | null;
    return {
      bloomShown: !!bloom && getComputedStyle(bloom).display !== 'none' && bloom.getBoundingClientRect().height > 0,
      petalPx: petal ? parseFloat(getComputedStyle(petal).fontSize) : 0,
      glowShown: glow.length > 0 && glow.every((g) => getComputedStyle(g).display !== 'none' && g.getBoundingClientRect().height > 0),
      sparksShown: glow.every((g) => [...g.querySelectorAll('i')].every((i) => getComputedStyle(i).display !== 'none')),
      ringPx: glow[0] ? parseFloat(getComputedStyle(glow[0], '::before').boxShadow.split(' ').find((p) => p.endsWith('px')) ?? '0') : 0,
    };
  }, id);
  const sizes: Record<number, number> = {};
  for (const z of [1, 0.5, 0.2]) {
    await page.evaluate((zz) => (window as any).__vizitai.ui.set({ zoom: zz }), z);
    await expect.poll(async () => (await look(due)).bloomShown).toBe(true);
    const l = await look(due);
    expect(l.glowShown).toBe(true);
    expect(l.sparksShown).toBe(true);
    sizes[z] = l.petalPx;
    expect(l.petalPx).toBeGreaterThanOrEqual(9); // never too small to see
  }
  expect(sizes[1]).toBeGreaterThan(sizes[0.2]!); // the flowers shrink with the entry
  // the quarter-hour visit is a sliver at the smallest zoom and still shows its own flowers and glow
  await expect.poll(async () => (await look(quick)).bloomShown).toBe(true);
});
