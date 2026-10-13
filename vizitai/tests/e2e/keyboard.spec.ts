import { test, expect, type Locator, type Page } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const appts = (page: Page) => page.evaluate(() => (window as any).__vizitai.db.appointments.toArray());

/**
 * iOS raises the keyboard only for a focus() made synchronously inside the tap handler.
 * Records which element holds focus at the very end of the tap's click dispatch (a window
 * bubble listener runs after the element's own handler, before any re-render or await).
 */
async function focusAtEndOfTap(page: Page, target: Locator): Promise<string | null> {
  await page.evaluate(() => {
    (window as any).__focusAtTap = undefined;
    window.addEventListener('click', () => {
      const el = document.activeElement as HTMLElement | null;
      (window as any).__focusAtTap = el?.dataset.testid ?? el?.tagName ?? null;
    }, { once: true });
  });
  await target.click();
  return page.evaluate(() => (window as any).__focusAtTap);
}

test.describe('keyboard opens inside the tap that opens the new sheet', () => {
  test('empty slot', async ({ page }) => {
    await openApp(page);
    expect(await focusAtEndOfTap(page, page.getByTestId('slot-2026-10-14T10:30'))).toBe('kb-primer');
    await expect(page.getByTestId('field-name')).toBeFocused();
  });

  test('"+" focuses before it waits for the default start', async ({ page }) => {
    await openApp(page);
    expect(await focusAtEndOfTap(page, page.getByTestId('btn-add'))).toBe('kb-primer');
    await expect(page.getByTestId('field-name')).toBeFocused();
  });

  test('Registruoti on the client card', async ({ page }) => {
    await openApp(page);
    await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T10:00' }]);
    await page.getByTestId('tab-clients').click();
    await page.getByTestId('client-row-0').click();
    expect(await focusAtEndOfTap(page, page.getByTestId('card-book'))).toBe('kb-primer');
    await expect(page.getByTestId('field-name')).toBeFocused();
  });

  test('Užregistruoti į priekį opens on the calendar and does NOT raise the keyboard', async ({ page }) => {
    await openApp(page);
    const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
    await page.getByTestId(`entry-${id}`).click();
    await page.getByTestId('act-repeat').click();
    await expect(page.getByTestId('timewheel')).toBeVisible();
    await expect(page.getByTestId('kb-primer')).not.toBeFocused();
    await expect(page.getByTestId('field-name')).not.toBeFocused();
  });

  test('the primer is a real, hidden 16px input that screen readers skip', async ({ page }) => {
    await openApp(page);
    const p = page.getByTestId('kb-primer');
    await expect(p).toHaveAttribute('aria-hidden', 'true');
    await expect(p).toHaveAttribute('tabindex', '-1');
    const css = await p.evaluate((el) => { const s = getComputedStyle(el); return { display: s.display, font: parseFloat(s.fontSize), opacity: s.opacity }; });
    expect(css.display).not.toBe('none');
    expect(css.font).toBeGreaterThanOrEqual(16);
    expect(css.opacity).toBe('0');
  });
});

test.describe('the name field and the backdrop', () => {
  test('a backdrop tap with a typed name keeps the sheet and the name, and only hides the keyboard', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('slot-2026-10-14T10:30').click();
    await page.getByTestId('field-name').fill('Ona');
    await expect(page.getByTestId('field-name')).toBeFocused();
    await page.mouse.click(200, 40); // the dimmed area above the sheet
    await expect(page.getByTestId('field-name')).not.toBeFocused();
    await expect(page.getByTestId('sheet')).toBeVisible();
    await expect(page.getByTestId('field-name')).toHaveValue('Ona');
    await page.mouse.click(200, 40); // still not thrown away
    await expect(page.getByTestId('sheet')).toBeVisible();
    await page.getByTestId('btn-dismiss').click(); // Atšaukti still closes
    await expect(page.getByTestId('sheet')).toHaveCount(0);
  });

  test('a backdrop tap with an empty, untouched field closes the sheet', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('slot-2026-10-14T10:30').click();
    await expect(page.getByTestId('field-name')).toBeFocused();
    await page.mouse.click(200, 40);
    await expect(page.getByTestId('sheet')).toHaveCount(0);
  });

  test('Enter hides the keyboard, moves on to Paslauga and does not save', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('slot-2026-10-14T10:30').click();
    await expect(page.getByTestId('field-name')).toHaveAttribute('enterkeyhint', 'next');
    await page.getByTestId('field-name').fill('Ona');
    await page.getByTestId('field-name').press('Enter');
    await expect(page.getByTestId('field-name')).not.toBeFocused();
    await expect(page.getByTestId('svc-0')).toBeVisible();
    await expect(page.getByTestId('sheet')).toBeVisible();
    await page.waitForTimeout(200);
    expect(await appts(page)).toHaveLength(0);
  });

  test('at most 5 suggestions are shown', async ({ page }) => {
    await openApp(page);
    await seedAppts(page, ['Ona', 'Jonas', 'Rasa', 'Asta', 'Inga', 'Eglė', 'Dalia'].map((name, i) => ({ name, start: `2026-10-0${i + 1}T10:00` })));
    await page.getByTestId('slot-2026-10-14T10:30').click();
    await expect(page.getByTestId('suggest-4')).toBeVisible(); // recents: the five latest
    await expect(page.getByTestId('suggest-5')).toHaveCount(0);
    await page.getByTestId('field-name').fill('a'); // Rasa, Asta (start with a letter a? no: words starting with a) and Dalia, Inga, Jonas... ranked, max 5
    await expect(page.getByTestId('suggest-0')).toBeVisible();
    await expect(page.getByTestId('suggest-5')).toHaveCount(0);
  });
});

test.describe('a hidden service is never preselected', () => {
  async function hideFirstUsed(page: Page) {
    await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T10:00', service: 1 }]);
    return page.evaluate(async () => {
      const { repo } = (window as any).__vizitai;
      const svc = await repo.listServices(true);
      await repo.setServiceActive(svc[1].id, false);
      return { hidden: svc[1].id, firstActive: svc[0].id };
    });
  }

  test('Registruoti', async ({ page }) => {
    await openApp(page);
    const ids = await hideFirstUsed(page);
    await page.getByTestId('tab-clients').click();
    await page.getByTestId('client-row-0').click();
    await page.getByTestId('card-book').click();
    await expect(page.getByTestId('field-name')).toHaveValue('Ona');
    await page.getByTestId('btn-next').click();
    await expect(page.getByTestId('svc-0')).toHaveClass(/on/);
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('sheet')).toHaveCount(0);
    await expect.poll(async () => (await appts(page)).filter((a: any) => a.start !== '2026-10-01T10:00').map((a: any) => a.serviceId)).toEqual([ids.firstActive]);
  });

  test('Užregistruoti į priekį', async ({ page }) => {
    await openApp(page);
    const ids = await hideFirstUsed(page);
    await page.getByTestId('tab-clients').click();
    await page.getByTestId('client-row-0').click();
    await page.getByTestId('card-repeat').click();
    await expect(page.getByTestId('timewheel')).toBeVisible();
    await page.getByTestId('btn-save-time').click(); // saves with the client's usual service, never the hidden one
    await expect(page.getByTestId('sheet')).toHaveCount(0);
    await expect.poll(async () => (await appts(page)).filter((a: any) => a.start !== '2026-10-01T10:00').map((a: any) => a.serviceId)).toEqual([ids.firstActive]);
  });
});
