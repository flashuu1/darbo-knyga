import type { VizitaiDB } from '../../src/db/db';
import type { createRepo } from '../../src/db/repo';
import type { Appointment, Service } from '../../src/db/types';
import { newId } from '../../src/logic/id';
import { addDays, datePart } from '../../src/logic/time';
import { t } from '../../src/i18n/lt';

/**
 * Invented but believable books for trying the app on a test phone: 52 clients and two years of visits (regulars,
 * occasional, one-timers), amounts, a few no-shows, days off, expenses, five visits waiting for their amount, some paid
 * in the last two weeks, and bookings for the next weeks. Deterministic: the same `now` gives the same file.
 * Not part of the app (it lives under tests/); the file is made by tests/unit/demo-backup.test.ts.
 */
const NAMES = ['Ona Petraitė', 'Rasa Kazlauskaitė', 'Jurgita Jonaitytė', 'Gintarė Vaitkutė', 'Eglė Stankutė', 'Monika Žukauskaitė', 'Aušra Balčiūnaitė', 'Daiva Kavaliauskienė', 'Vilma Rimkutė', 'Ieva Pocytė', 'Laura Mikalauskaitė', 'Giedrė Šimkutė', 'Agnė Butkutė', 'Justina Urbonaitė', 'Indrė Navickaitė', 'Kristina Račkauskaitė', 'Sigita Lukošiūtė', 'Rūta Ramanauskaitė', 'Dalia Grigaitė', 'Edita Paulauskienė', 'Loreta Kučinskaitė', 'Neringa Sakalauskaitė', 'Violeta Bagdonaitė', 'Birutė Jankauskaitė', 'Rima Morkūnaitė', 'Lina Venckutė', 'Marija Petrauskienė', 'Asta Zubrickaitė', 'Ramunė Černiauskaitė', 'Karolina Vasiliauskaitė', 'Viktorija Adomaitytė', 'Austėja Pranckutė', 'Greta Žilinskaitė', 'Emilija Jakubauskaitė', 'Miglė Ivanauskaitė', 'Gabija Kairytė', 'Ugnė Mockutė', 'Dovilė Mačiulaitė', 'Jolanta Stonkutė', 'Ilona Šaulytė', 'Živilė Žemaitytė', 'Vaida Baltrušaitytė', 'Simona Rutkauskaitė', 'Rita Čiurlionytė', 'Tomas Kazlauskas', 'Mantas Petkevičius', 'Jonas Butkus', 'Ąžuolė Kriaučiūnaitė', 'Šarūnė Gudaitė', 'Ūla Tamošaitė', 'Ernesta Lapinskaitė', 'Yolanda Šeštokaitė'];
const MINUTES: Record<string, number> = { Kirpimas: 60, Dažymas: 120, 'Kirpimas ir dažymas': 150, Sruogelės: 150, Šukuosena: 75, Vestuvės: 240, Kita: 30 };
const PRICE: Record<string, number> = { Kirpimas: 3500, Dažymas: 7000, 'Kirpimas ir dažymas': 9500, Sruogelės: 11000, Šukuosena: 4500, Vestuvės: 25000, Kita: 2500 };
const PICK = ['Kirpimas', 'Dažymas', 'Kirpimas ir dažymas', 'Sruogelės', 'Šukuosena'];

export async function fillDemo(db: VizitaiDB, repo: ReturnType<typeof createRepo>, now: string) {
  let h = 20261103;
  const rnd = () => (h = (h * 48271) % 2147483647) / 2147483647;
  const today = datePart(now);
  const services = await repo.listServices();
  for (const s of services) await repo.updateService(s.id, { minutes: MINUTES[s.name] ?? 30 });
  const byName = new Map<string, Service>((await repo.listServices()).map((s) => [s.name, s]));
  for (const n of ['Medžiagos', 'Nuoma', 'Mokesčiai', 'Kita']) await repo.addOption('expense', n);
  const expOpts = await repo.listOptions('expense');
  const personal = await repo.listOptions('personal');

  const taken = new Set<string>();
  /** The nearest Tuesday to Saturday at a free working hour. */
  const slot = (date: string): string => {
    let d = date;
    for (let i = 0; i < 7; i++) { const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; if (wd >= 1 && wd <= 5) break; d = addDays(d, 1); }
    const hours = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7 === 5 ? [9, 10, 11, 12, 13] : [9, 10, 11, 12, 14, 15, 16, 17];
    const k = Math.floor(rnd() * hours.length);
    for (let i = 0; i < hours.length * 2; i++) {
      const hr = hours[(k + i) % hours.length]!, key = `${d}${hr}`;
      if (!taken.has(key)) { taken.add(key); return `${d}T${String(hr).padStart(2, '0')}:00`; }
    }
    return `${addDays(d, 7)}T09:00`;
  };
  const iso = (s: string) => new Date(`${s}:00Z`).toISOString();
  const rows: Appointment[] = [];
  const add = (a: Partial<Appointment> & Pick<Appointment, 'kind' | 'start'>) => {
    const ts = iso(a.start < now ? a.start : now);
    rows.push({ id: newId(), clientId: null, title: null, serviceId: null, status: 'booked', cancelReason: null, cancelledAt: null, moves: [], createdAt: ts, updatedAt: ts, ...a });
  };
  const money = (name: string) => Math.round(PRICE[name]! * (0.9 + rnd() * 0.25) / 500) * 500;

  // who is who: five waiting for an amount, seven paid lately, eighteen with a booking, a few brand new
  const pending = new Set([5, 0, 11, 17, 29]), paidLately = new Set([2, 8, 13, 19, 25, 33, 38]), upcoming = new Set([1, 3, 4, 6, 7, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 23, 24, 26, 27]), fresh = new Set([40, 41, 42, 49, 50]);
  for (let i = 0; i < NAMES.length; i++) {
    const c = await repo.matchOrCreateClient(NAMES[i]!);
    await repo.updateClient(c.id, { phone: `+370 6${String(Math.floor(rnd() * 9_000_000) + 1_000_000)}`.replace(/^(\+370 6\d{2})(\d{5})$/, '$1 $2') });
    const kind = i % 7 === 0 ? 'rare' : i % 3 === 0 ? 'often' : 'regular';
    const gap = kind === 'often' ? 21 + rnd() * 14 : kind === 'regular' ? 35 + rnd() * 25 : 80 + rnd() * 60;
    const since = fresh.has(i) ? 0 : Math.min(23, Math.floor(rnd() * 24)); // months ago of the first visit
    let lastDays = pending.has(i) ? 1 + (i % 3) : paidLately.has(i) ? 1 + (i % 12) : fresh.has(i) ? 2 + (i % 8) : upcoming.has(i) ? 3 + Math.floor(rnd() * 20) : 15 + Math.floor(rnd() * rnd() * 170) + (kind === 'rare' ? 60 : 0);
    if (!fresh.has(i)) lastDays = Math.min(lastDays, since * 30 + 1);
    const fav = PICK[i % PICK.length]!;
    // visits backwards from the last one until the first
    const ago: number[] = [lastDays];
    if (!fresh.has(i)) for (let d = lastDays + gap * (0.8 + rnd() * 0.4); d <= since * 30 + 28; d += gap * (0.8 + rnd() * 0.4)) ago.push(Math.round(d));
    ago.forEach((n, k) => {
      const name = rnd() < 0.18 ? PICK[Math.floor(rnd() * PICK.length)]! : fav;
      const start = slot(addDays(today, -n));
      if (start >= now) return;
      const isLast = k === 0, waiting = pending.has(i) && isLast;
      const noShow = !isLast && rnd() < 0.03;
      add({ kind: 'client', clientId: c.id, serviceId: byName.get(name)!.id, start, status: noShow ? 'noshow' : 'booked', ...(waiting || noShow ? {} : { amountCents: money(name) }) });
    });
    if (upcoming.has(i)) {
      const name = fav, start = slot(addDays(today, 1 + Math.floor(rnd() * 20)));
      if (start > now) add({ kind: 'client', clientId: c.id, serviceId: byName.get(name)!.id, start });
    }
  }
  // two cancellations this week (they stay visible for seven days)
  for (const [who, daysAgo] of [[1, 2], [44, 1]] as const) {
    const c = await repo.matchOrCreateClient(NAMES[who]!);
    add({ kind: 'client', clientId: c.id, serviceId: byName.get('Kirpimas')!.id, start: slot(addDays(today, 3 + daysAgo)), status: 'cancelled', cancelReason: 'client', cancelledAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString() });
  }
  // days off, appointments of her own, expenses
  for (let m = 0; m < 24; m++) {
    const base = addDays(today, -m * 30 - 3);
    for (let k = 0; k < 2 + (m % 2); k++) add({ kind: 'personal', title: t('off.title'), durationMinutes: 240 + 60 * (k % 3), optionId: null, start: `${addDays(base, -k * 9)}T${k % 2 ? '13' : '09'}:00` });
    add({ kind: 'personal', title: personal[0]?.name ?? 'Psichologas', durationMinutes: 60, optionId: personal[0]?.id ?? null, start: `${addDays(base, -5)}T18:00` });
    add({ kind: 'expense', title: 'Nuoma', optionId: expOpts[1]?.id ?? null, amountCents: 25000, start: `${addDays(base, -2)}T09:00` });
    for (let k = 0; k < 2; k++) add({ kind: 'expense', title: 'Medžiagos', optionId: expOpts[0]?.id ?? null, amountCents: Math.round((6000 + rnd() * 14000) / 100) * 100, start: `${addDays(base, -8 - k * 7)}T10:00` });
  }
  await db.appointments.bulkAdd(rows);
  return { appointments: rows.length };
}
