import { test, expect } from '@playwright/test';
import { apptState, openApp, seedAppts, seedOptions } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-10-14T18:00:00';

test('the summary button opens the end-of-day page, with a badge for what still waits for its amount', async ({ page }) => {
  await openApp(page, NOW);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }, { name: 'Rasa', start: '2026-10-14T11:00' }, { name: 'Jonas', start: '2026-10-14T20:00' }]);
  await expect(page.getByTestId('due-badge')).toHaveText('2');
  await page.getByTestId('summary-btn').click();
  await expect(page.getByTestId('day-sheet')).toBeVisible();
  await expect(page.getByTestId('eod-date')).toContainText('spalio 14');
  await expect(page.getByTestId('eod-row-0')).toContainText('Ona');
  await expect(page.getByTestId('eod-row-1')).toContainText('Rasa');
  await expect(page.getByTestId('eod-row-2')).toHaveCount(0); // Jonas has not come yet
  await expect(page.getByTestId('eod-upcoming')).toContainText('1');
  await expect(page.getByTestId('eod-progress')).toContainText('Sumokėta 0 iš 2');
});

test('a chip with a usual amount settles the visit in one tap; the page updates and the day adds up', async ({ page }) => {
  await openApp(page, NOW);
  const [old, a, b] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-07T09:00' }, { name: 'Ona', start: '2026-10-14T09:00' }, { name: 'Rasa', start: '2026-10-14T11:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 4500), old);
  await page.getByTestId('summary-btn').click();
  await expect(page.getByTestId('eod-row-chip-0-0')).toContainText('45,00');
  await expect(page.getByTestId('eod-row-chip-1-0')).toHaveCount(0); // Rasa has no history: only "Kita suma"
  await page.getByTestId('eod-row-chip-0-0').click();
  await expect.poll(async () => (await apptState(page, a)).amountCents).toBe(4500);
  await expect(page.getByTestId('eod-paid-0')).toContainText('Ona');
  await expect(page.getByTestId('eod-in')).toContainText('45,00');
  await expect(page.getByTestId('eod-progress')).toContainText('Sumokėta 1 iš 2');
  await expect(page.getByTestId('due-badge')).toHaveText('1');
  void b;
});

test('"Kita suma" opens Suma and returns to the day page; settling the last visit closes the day', async ({ page }) => {
  await openApp(page, NOW);
  const [a] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }]);
  await page.getByTestId('summary-btn').click();
  await page.getByTestId('eod-row-other-0').click();
  await expect(page.getByTestId('amount-sheet')).toBeVisible();
  await page.getByTestId('amount-input').fill('60');
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId('again-no').click(); // not booking again
  await expect(page.getByTestId('day-sheet')).toBeVisible(); // back where she was
  await expect.poll(async () => (await apptState(page, a)).amountCents).toBe(6000);
  await expect(page.getByTestId('eod-done')).toHaveText('Viskas suvesta!');
  await expect(page.getByTestId('eod-net')).toContainText('60,00');
  await expect(page.getByTestId('burst')).toBeAttached(); // and a little celebration
  await expect(page.getByTestId('due-badge')).toHaveCount(0);
});

test('Suma opened elsewhere does not return to the day page', async ({ page }) => {
  await openApp(page, NOW);
  const [a] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }]);
  await page.getByTestId('summary-btn').click();
  await page.getByTestId('btn-close').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.getByTestId(`entry-${a}`).click(); // Suma from the calendar
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('day-sheet')).toHaveCount(0);
});

test('earlier visits that never got an amount are listed too, and the paid ones can be booked again', async ({ page }) => {
  await openApp(page, NOW);
  const [older, today] = await seedAppts(page, [{ name: 'Rasa', start: '2026-10-10T10:00' }, { name: 'Ona', start: '2026-10-14T09:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 3000), today);
  await page.getByTestId('summary-btn').click();
  await expect(page.getByTestId('eod-older-0')).toContainText('Rasa');
  await expect(page.getByTestId('eod-older-0')).toContainText('spalio 10');
  await page.getByTestId('eod-older-chip-0-0').or(page.getByTestId('eod-older-other-0')).first().click();
  void older;
  await expect(page.getByTestId('amount-sheet')).toBeVisible();
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('day-sheet')).toBeVisible();
  await page.getByTestId('eod-again-0').click();
  await expect(page.getByTestId('timewheel')).toBeVisible(); // straight to date and time for the same client
});

test('expenses count in the day, and a day without visits says so', async ({ page }) => {
  await openApp(page, NOW);
  await seedOptions(page);
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai;
    const [o] = await repo.listOptions('expense');
    await repo.createAppointment({ kind: 'expense', title: o.name, optionId: o.id, amountCents: 2000, start: '2026-10-14T10:00' });
  });
  await page.getByTestId('summary-btn').click();
  await expect(page.getByTestId('eod-out')).toContainText('20,00');
  await expect(page.getByTestId('eod-net')).toContainText('20,00');
  await expect(page.getByTestId('eod-empty')).toBeVisible();
});

test('the button follows the view: Dienos, Savaitės and Mėnesio suvestinė, each for what is on screen', async ({ page }) => {
  await openApp(page, NOW);
  // one visit today, one on Monday of the same week, one at the start of the month, one next month
  const [today, monday, early, nextMonth] = await seedAppts(page, [
    { name: 'Ona', start: '2026-10-14T09:00' }, { name: 'Rasa', start: '2026-10-12T09:00' }, { name: 'Jonas', start: '2026-10-02T09:00' }, { name: 'Egle', start: '2026-11-03T09:00' },
  ]);
  await page.evaluate(async ([a, b, c, d]) => {
    const { repo } = (window as any).__vizitai;
    await repo.setAmount(a, 1000); await repo.setAmount(b, 2000); await repo.setAmount(c, 4000); await repo.setAmount(d, 8000);
  }, [today, monday, early, nextMonth]);
  const open = async () => { await page.getByTestId('summary-btn').click(); await expect(page.getByTestId('day-sheet')).toBeVisible(); };
  const close = async () => { await page.getByTestId('btn-close').click(); await expect(page.getByTestId('day-sheet')).toHaveCount(0); };
  await expect(page.getByTestId('summary-label')).toHaveText('Dienos suvestinė');
  await open();
  await expect(page.getByTestId('eod-in')).toContainText('10,00'); // the day: only today
  await close();
  await page.getByTestId('seg-week').click();
  await expect(page.getByTestId('summary-label')).toHaveText('Savaitės suvestinė');
  await open();
  await expect(page.getByTestId('eod-date')).toContainText('spalio 12 d. – spalio 18 d.');
  await expect(page.getByTestId('eod-in')).toContainText('30,00'); // Monday and today
  await close();
  await page.getByTestId('month-name').click(); // Mėnuo
  await expect(page.getByTestId('summary-label')).toHaveText('Mėnesio suvestinė');
  await open();
  await expect(page.getByTestId('eod-date')).toContainText('spalis 2026');
  await expect(page.getByTestId('eod-in')).toContainText('70,00'); // all of October, not November
  await close();
  await page.getByTestId('month-name').click(); // back to a day view
  await expect(page.getByTestId('summary-label')).toHaveText('Dienos suvestinė');
});

test('a week summary lists the visits that wait for their amount with their day, and settling them works the same', async ({ page }) => {
  await openApp(page, NOW);
  const [a] = await seedAppts(page, [{ name: 'Rasa', start: '2026-10-12T09:00' }]);
  await page.getByTestId('seg-week').click();
  await page.getByTestId('summary-btn').click();
  await expect(page.getByTestId('eod-row-0')).toContainText('spalio 12');
  await page.getByTestId('eod-row-other-0').click();
  await page.getByTestId('amount-input').fill('25');
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId('again-no').click();
  await expect(page.getByTestId('day-sheet')).toBeVisible(); // back on the week page
  await expect(page.getByTestId('eod-date')).toContainText('spalio 12 d. – spalio 18 d.');
  await expect.poll(async () => (await apptState(page, a)).amountCents).toBe(2500);
  await expect(page.getByTestId('eod-done')).toBeVisible();
});
