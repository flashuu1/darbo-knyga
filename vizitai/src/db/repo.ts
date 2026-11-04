import { newId } from '../logic/id';
import { db } from './db';
import type { Appointment, CancelReason, Client, Option, OptionGroup, Service, ServiceColor, Settings } from './types';
import type { VizitaiDB } from './db';
import { DEFAULT_SETTINGS } from './seed';
import { cleanName, foldName, ltCollator } from '../logic/names';
import { addDays, addMinutes, datePart, minutesOfDay, nowLocal, parse, scopeRange, type Scope } from '../logic/time';
import { findOverlap, findOverlaps, minutesFor, nextFreeSlot, PERSONAL_MINUTES, SHORT_MINUTES, type Block } from '../logic/overlap';
import { t } from '../i18n/lt';
import { isAmountDue, isValidCents, MAX_AMOUNT_CENTS } from '../logic/amount';
import type { AnalyticsInput, OffRec, VisitRec } from '../logic/analytics';

/** One row of the contacts list (see listClients). */
export interface ClientRow {
  client: Client;
  /** Date (YYYY-MM-DD) of the last visit that took place. */
  lastVisit: string | null;
  /** The longest-waiting past visit that still has no amount. */
  pending: { id: string; start: string } | null;
  /** The latest visit of the last two weeks whose amount she entered: shown as a green "paid" pill for two weeks. */
  paid: { id: string; cents: number; start: string } | null;
  /** Visits that took place (not cancelled, not no-shows) and the money entered for them, all time. */
  visitCount: number; spentCents: number;
  /** Start of the next booked visit. */
  nextVisit: string | null;
  /** The ids of that visit and of the latest visit that took place (press and hold on a row opens the one the row talks about). */
  nextId: string | null; lastId: string | null;
  /** What the latest visit that took place brought in (null: no amount entered, or no visit). It is shown after the green pill has expired. */
  lastCents: number | null;
}
/** How long a cancelled visit stays visible before it is removed. */
/** One name suggestion in the booking flow: the client and what she wants to see at a glance. */
export interface ClientSuggestion { client: Client; lastVisit: string | null; nextVisit: string | null; waiting: boolean; visitCount: number; lastService: string | null }
export const CANCELLED_KEEP_DAYS = 7;
/** How long the green "paid" pill stays on a client row after the visit. */
export const PAID_PILL_DAYS = 14;
/** One entry that is in the way of another: who, what and when it runs (start and end are local `YYYY-MM-DDTHH:mm`). */
export interface OverlapInfo { id: string; label: string; what: string; start: string; end: string }
export interface Entry { appt: Appointment; label: string; service: Service | null; minutes: number; color: ServiceColor; amountCents: number | null }
const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

export function createRepo(db: VizitaiDB) {
  let lastTs = 0; // strictly increasing, so "most recent" ordering never ties within a millisecond
  const now = () => { lastTs = Math.max(Date.now(), lastTs + 1); return new Date(lastTs).toISOString(); };
  const uuid = newId;
  const serviceMap = async () => new Map((await db.services.toArray()).map((s) => [s.id, s]));

  async function toEntries(list: Appointment[]): Promise<Entry[]> {
    const ids = [...new Set(list.map((a) => a.clientId).filter((x): x is string => !!x))];
    // one read transaction for both lookups (every IndexedDB transaction has a fixed cost)
    const [services, clients] = await db.transaction('r', db.services, db.clients, async () => [
      await serviceMap(),
      new Map((await db.clients.bulkGet(ids)).filter((c): c is Client => !!c).map((c) => [c.id, c])),
    ] as const);
    return list.map((appt) => {
      const service = appt.serviceId ? services.get(appt.serviceId) ?? null : null;
      const label = appt.kind === 'client' ? clients.get(appt.clientId ?? '')?.name ?? '' : appt.title ?? '';
      return { appt, label, service, minutes: minutesFor(appt, services), color: appt.kind === 'expense' ? 'indigo' : appt.kind === 'personal' ? 'red' : service?.color ?? 'gray', amountCents: isValidCents(appt.amountCents) ? appt.amountCents : null };
    });
  }
  // Same start: the earlier booking first, so side-by-side lanes keep a stable order.
  const byStart = (a: Appointment, b: Appointment) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  async function mutate(id: string, patch: (a: Appointment) => Appointment) {
    const before = await db.appointments.get(id);
    if (!before) throw new Error('not-found');
    const after = { ...patch(structuredClone(before)), updatedAt: now() };
    await db.appointments.put(after);
    return { before, after };
  }

  return {
    async getSettings(): Promise<Settings> { return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS; },
    async updateSettings(p: Partial<Settings>) { await db.settings.update('settings', p); },

    async listServices(activeOnly = false): Promise<Service[]> {
      const all = await db.services.orderBy('order').toArray();
      return activeOnly ? all.filter((s) => s.active) : all;
    },
    async addService(name: string, color: ServiceColor = 'teal', minutes = 15): Promise<Service> {
      const all = await db.services.toArray();
      const s: Service = { id: uuid(), name: cleanName(name) || t('service.new'), color, minutes, order: all.length ? Math.max(...all.map((x) => x.order)) + 1 : 0, active: true };
      await db.services.add(s);
      return s;
    },
    async updateService(id: string, p: Partial<Pick<Service, 'name' | 'color' | 'minutes' | 'floral'>>) {
      const { name, ...rest } = p;
      const clean = name === undefined ? '' : cleanName(name);
      const patch = clean ? { ...rest, name: clean } : rest; // an empty name is ignored
      if (Object.keys(patch).length) await db.services.update(id, patch);
    },
    async moveService(id: string, dir: -1 | 1) {
      const all = await db.services.orderBy('order').toArray();
      const i = all.findIndex((s) => s.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= all.length) return;
      await db.transaction('rw', db.services, async () => {
        await db.services.update(all[i].id, { order: all[j].order });
        await db.services.update(all[j].id, { order: all[i].order });
      });
    },
    async setServiceActive(id: string, active: boolean) {
      if (!active) {
        const others = (await db.services.toArray()).filter((s) => s.active && s.id !== id);
        if (others.length === 0) throw new Error('last-active');
      }
      await db.services.update(id, { active });
    },

    async listOptions(group: OptionGroup): Promise<Option[]> { return (await db.options.where('group').equals(group).toArray()).sort((a, b) => a.order - b.order); },
    async addOption(group: OptionGroup, name: string): Promise<Option> {
      const all = await db.options.where('group').equals(group).toArray();
      const o: Option = { id: uuid(), group, name: cleanName(name) || t('option.new'), order: all.length ? Math.max(...all.map((x) => x.order)) + 1 : 0 };
      await db.options.add(o);
      return o;
    },
    /** `costCents: null` removes the fixed amount; anything that is not a positive whole number of cents is ignored. */
    async updateOption(id: string, p: { minutes?: number; costCents?: number | null }) {
      if (p.minutes !== undefined && Number.isInteger(p.minutes) && p.minutes >= 15 && p.minutes <= 720) await db.options.update(id, { minutes: p.minutes });
      if (p.costCents === null) await db.options.where('id').equals(id).modify((o) => { delete o.costCents; });
      else if (p.costCents !== undefined && Number.isInteger(p.costCents) && p.costCents > 0 && p.costCents <= MAX_AMOUNT_CENTS) await db.options.update(id, { costCents: p.costCents });
    },
    async moveOption(id: string, dir: -1 | 1) {
      const o = await db.options.get(id);
      if (!o) return;
      const all = (await db.options.where('group').equals(o.group).toArray()).sort((a, b) => a.order - b.order);
      const i = all.findIndex((x) => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= all.length) return;
      await db.transaction('rw', db.options, async () => {
        await db.options.update(all[i].id, { order: all[j].order });
        await db.options.update(all[j].id, { order: all[i].order });
      });
    },
    async renameOption(id: string, name: string) { const n = cleanName(name); if (n) await db.options.update(id, { name: n }); }, // an empty name is ignored
    /** Entries keep the name they were made with, so a choice can always be removed. Undo: restoreOption. */
    async deleteOption(id: string): Promise<Option | null> { const o = await db.options.get(id); if (o) await db.options.delete(id); return o ?? null; },
    async restoreOption(o: Option) { await db.options.put(o); },
    /** All the money in (amounts of visits) and out (expenses) so far; cancelled and no-show entries do not count. */
    async balance(): Promise<{ inCents: number; outCents: number; balanceCents: number }> {
      let inCents = 0, outCents = 0;
      for (const a of await db.appointments.toArray()) {
        if (a.status !== 'booked' || !isValidCents(a.amountCents)) continue;
        if (a.kind === 'client') inCents += a.amountCents; else if (a.kind === 'expense') outCents += a.amountCents;
      }
      return { inCents, outCents, balanceCents: inCents - outCents };
    },

    getClient: (id: string) => db.clients.get(id),
    async matchOrCreateClient(rawName: string): Promise<Client> {
      const name = cleanName(rawName);
      if (!name) throw new Error('empty-name');
      const nameKey = foldName(name);
      const found = await db.clients.where('nameKey').equals(nameKey).first();
      if (found) return found;
      const ts = now();
      const c: Client = { id: uuid(), name, nameKey, createdAt: ts, updatedAt: ts };
      await db.clients.add(c);
      return c;
    },
    async recentClients(limit = 5): Promise<Client[]> {
      const appts = (await db.appointments.toArray()).filter((a) => a.clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const ids: string[] = [];
      for (const a of appts) { if (!ids.includes(a.clientId!)) ids.push(a.clientId!); if (ids.length === limit) break; }
      return (await db.clients.bulkGet(ids)).filter((c): c is Client => !!c);
    },
    /**
     * Suggestions while typing a name. Ranked: the name starts with the text, then a later word starts with it,
     * then it appears anywhere (from 2 letters); inside a rank the client she books most, then most recently.
     */
    async searchClients(query: string, limit = 6): Promise<Client[]> {
      const q = foldName(query);
      if (!q) return this.recentClients(5);
      const rank = (c: Client) => (c.nameKey.startsWith(q) ? 0 : c.nameKey.split(' ').some((w) => w.startsWith(q)) ? 1 : q.length >= 2 && c.nameKey.includes(q) ? 2 : -1);
      const hits = (await db.clients.toArray()).map((c) => ({ c, r: rank(c) })).filter((x) => x.r >= 0);
      const stats = new Map<string, { n: number; last: string }>();
      for (const { c } of hits) {
        const list = await db.appointments.where('clientId').equals(c.id).toArray();
        stats.set(c.id, { n: list.length, last: list.reduce((m, a) => (a.start > m ? a.start : m), '') });
      }
      return hits
        .sort((x, y) => x.r - y.r || stats.get(y.c.id)!.n - stats.get(x.c.id)!.n || stats.get(y.c.id)!.last.localeCompare(stats.get(x.c.id)!.last) || ltCollator.compare(x.c.name, y.c.name))
        .slice(0, limit)
        .map((x) => x.c);
    },
    /** searchClients, with each client's last visit, next visit, whether an amount waits, and the service they had last. */
    async suggestClients(query: string, limit = 6, now_: string = nowLocal()): Promise<ClientSuggestion[]> {
      const found = await this.searchClients(query, limit);
      if (!found.length) return [];
      const [rows, services] = await Promise.all([this.listClients(now_), serviceMap()]);
      const by = new Map(rows.map((r) => [r.client.id, r]));
      return Promise.all(found.map(async (client): Promise<ClientSuggestion> => {
        const r = by.get(client.id), sid = await this.lastServiceId(client.id);
        return { client, lastVisit: r?.lastVisit ?? null, nextVisit: r?.nextVisit ?? null, waiting: !!r?.pending, visitCount: r?.visitCount ?? 0, lastService: sid ? services.get(sid)?.name ?? null : null };
      }));
    },
    async updateClient(id: string, p: { name?: string; phone?: string }) {
      const patch: Partial<Client> = { updatedAt: now() };
      if (p.name !== undefined) {
        const n = cleanName(p.name), key = foldName(n);
        // An empty name, or one whose key belongs to another client, is ignored so nameKey stays unique.
        const other = n ? await db.clients.where('nameKey').equals(key).first() : undefined;
        if (n && (!other || other.id === id)) { patch.name = n; patch.nameKey = key; }
      }
      if (p.phone !== undefined) patch.phone = p.phone.trim();
      await db.clients.update(id, patch);
    },
    async lastServiceId(clientId: string): Promise<string | null> {
      const list = (await db.appointments.where('clientId').equals(clientId).toArray())
        .filter((a) => a.serviceId && a.status !== 'cancelled').sort(byStart);
      return list.length ? list[list.length - 1].serviceId : null;
    },

    async createAppointment(i: { kind: 'client' | 'personal' | 'expense'; name?: string; title?: string; serviceId?: string | null; start: string; optionId?: string | null; amountCents?: number; minutes?: number }): Promise<Appointment> {
      parse(i.start); // throws on a malformed time; any minute is allowed (the time wheel is not limited to a grid)
      const start = i.start;
      let clientId: string | null = null, title: string | null = null;
      if (i.kind === 'client') clientId = (await this.matchOrCreateClient(i.name ?? '')).id;
      else { title = cleanName(i.title ?? ''); if (!title) throw new Error('empty-title'); }
      if (i.kind === 'expense' && !isValidCents(i.amountCents)) throw new Error('bad-amount');
      const ts = now();
      const a: Appointment = {
        id: uuid(), kind: i.kind, clientId, title, serviceId: i.kind === 'client' ? i.serviceId ?? null : null, start,
        status: 'booked', cancelReason: null, cancelledAt: null, moves: [], createdAt: ts, updatedAt: ts,
        ...(i.kind === 'client' ? {} : { optionId: i.optionId ?? null }), ...(i.kind === 'expense' ? { amountCents: i.amountCents } : {}),
        ...(i.kind === 'personal' && i.minutes ? { durationMinutes: i.minutes } : {}),
      };
      await db.appointments.add(a);
      return a;
    },
    getAppointment: (id: string) => db.appointments.get(id),
    async updateAppointment(id: string, p: Partial<Pick<Appointment, 'serviceId'>>) { return (await mutate(id, (a) => ({ ...a, ...p }))).after; },
    moveAppointment(id: string, to: string) {
      parse(to);
      const target = to;
      return mutate(id, (a) => ({ ...a, start: target, moves: [...a.moves, { at: now(), from: a.start, to: target }] }));
    },
    cancelAppointment(id: string, reason: CancelReason | null) {
      return mutate(id, (a) => ({ ...a, status: 'cancelled', cancelReason: reason, cancelledAt: now() }));
    },
    markNoShow(id: string) { return mutate(id, (a) => ({ ...a, status: 'noshow' })); },
    restoreAppointment(id: string) { return mutate(id, (a) => ({ ...a, status: 'booked', cancelReason: null, cancelledAt: null })); },
    /** Stores what she took for the visit (integer cents), or clears it with null. Undo: putSnapshot(before). */
    setAmount(id: string, cents: number | null) {
      if (cents !== null && !isValidCents(cents)) return Promise.reject(new Error('bad-amount'));
      return mutate(id, (a) => {
        const prev = isValidCents(a.amountCents) ? a.amountCents : null;
        // a confirmed amount that changes leaves a trail on the visit
        const log = prev !== null && prev !== cents ? [...(a.amountLog ?? []), { at: now(), from: prev, to: cents }] : a.amountLog;
        return { ...a, amountCents: cents, ...(log ? { amountLog: log } : {}) };
      });
    },
    async putSnapshot(a: Appointment) { await db.appointments.put(a); },
    deleteAppointment: (id: string) => db.appointments.delete(id),
    /** Cancelled visits that have not been purged yet, newest cancellation first. */
    async cancelledEntries(): Promise<Entry[]> {
      const list = (await db.appointments.where('status').equals('cancelled').toArray()).filter((a) => a.kind !== 'expense').sort((a, b) => (b.cancelledAt ?? '').localeCompare(a.cancelledAt ?? ''));
      return toEntries(list);
    },
    /** Deletes a client and all their visits. Returns what is needed to put them back (undo). */
    async deleteClient(id: string): Promise<{ client: Client; appts: Appointment[] } | null> {
      const client = await db.clients.get(id);
      if (!client) return null;
      const appts = await db.appointments.where('clientId').equals(id).toArray();
      await db.transaction('rw', db.clients, db.appointments, async () => {
        await db.appointments.bulkDelete(appts.map((a) => a.id));
        await db.clients.delete(id);
      });
      return { client, appts };
    },
    async restoreClient(snap: { client: Client; appts: Appointment[] }) {
      await db.transaction('rw', db.clients, db.appointments, async () => {
        await db.clients.put(snap.client);
        await db.appointments.bulkPut(snap.appts);
      });
    },
    /** The amounts this client paid before, most recent first, distinct, at most 3; the same service first. */
    async amountSuggestions(clientId: string, serviceId: string | null): Promise<number[]> {
      const list = (await db.appointments.where('clientId').equals(clientId).toArray())
        .filter((a) => a.status === 'booked' && isValidCents(a.amountCents) && a.amountCents > 0)
        .sort((a, b) => b.start.localeCompare(a.start));
      const out: number[] = [];
      for (const pass of [true, false]) {
        for (const a of list) {
          if ((a.serviceId === serviceId) !== pass || out.includes(a.amountCents!)) continue;
          out.push(a.amountCents!);
        }
      }
      return out.slice(0, 3);
    },
    /** How many client visits have taken place and still wait for their amount (everywhere, any day). */
    async dueCount(now_: string = nowLocal()): Promise<number> {
      return (await db.appointments.toArray()).filter((a) => isAmountDue(a, now_)).length;
    },
    /**
     * The books of a day, a week or a month: its client visits that wait for their amount (with the amounts this client
     * paid before as suggestions), earlier visits still waiting (only when the range contains today), the ones already
     * settled, and the money.
     */
    async summary(scope: Scope, date: string, now_: string = nowLocal()) {
      const { from, to } = scopeRange(scope, date);
      const list = await this.entriesBetween(from, to);
      const visits = list.filter((e) => e.appt.kind === 'client' && e.appt.status === 'booked');
      const due = visits.filter((e) => e.appt.start <= now_ && e.amountCents === null);
      const paid = visits.filter((e) => e.amountCents !== null);
      const upcoming = visits.filter((e) => e.appt.start > now_).length;
      const expenses = list.filter((e) => e.appt.kind === 'expense' && e.appt.status === 'booked' && e.amountCents !== null);
      let older: Entry[] = [];
      if (from <= datePart(now_) && datePart(now_) < to) {
        const before = await db.appointments.where('start').below(`${from}T00:00`).toArray();
        older = await toEntries(before.filter((a) => isAmountDue(a, now_)).sort(byStart));
      }
      const suggest: Record<string, number[]> = {};
      for (const e of [...due, ...older]) if (e.appt.clientId) suggest[e.appt.id] = await this.amountSuggestions(e.appt.clientId, e.appt.serviceId);
      return {
        scope, date, from, to, due, older, paid, upcoming, suggest,
        inCents: paid.reduce((n, e) => n + e.amountCents!, 0),
        outCents: expenses.reduce((n, e) => n + e.amountCents!, 0),
      };
    },
    async countVisits(clientId: string): Promise<number> { return db.appointments.where('clientId').equals(clientId).count(); },
    /**
     * Deletes a service. One that visits still use is only hidden (their labels and colours must not vanish);
     * the last active service cannot go (throws 'last-active').
     */
    async deleteService(id: string): Promise<{ result: 'deleted' | 'hidden'; service: Service }> {
      const service = await db.services.get(id);
      if (!service) throw new Error('not-found');
      if (service.active && !(await db.services.toArray()).some((s) => s.active && s.id !== id)) throw new Error('last-active');
      const used = (await db.appointments.toArray()).some((a) => a.serviceId === id);
      if (used) { await db.services.update(id, { active: false }); return { result: 'hidden', service }; }
      await db.services.delete(id);
      return { result: 'deleted', service };
    },
    async restoreService(s: Service) { await db.services.put(s); },
    /** Cancelled visits are kept for a week (so a mistake can be undone), then removed for good. Returns how many. */
    async purgeCancelled(now: Date = new Date(), days = CANCELLED_KEEP_DAYS): Promise<number> {
      const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
      return db.appointments.where('status').equals('cancelled').filter((a) => !!a.cancelledAt && a.cancelledAt < cutoff).delete();
    },

    async findOverlapFor(i: { start: string; kind: 'client' | 'personal' | 'expense'; serviceId: string | null; excludeId?: string; minutes?: number }) {
      if (i.kind === 'expense') return undefined; // money out can be noted at any time
      const services = await serviceMap();
      const minutes = i.minutes ?? (i.kind === 'personal' ? PERSONAL_MINUTES : i.kind !== 'client' || !i.serviceId ? SHORT_MINUTES : services.get(i.serviceId)?.minutes ?? SHORT_MINUTES);
      const lo = addMinutes(i.start, -1440), hi = addMinutes(i.start, 1440);
      const near = await db.appointments.where('start').between(lo, hi, true, true).toArray();
      const hit = findOverlap({ id: i.excludeId ?? '', start: i.start, minutes }, near, services);
      if (!hit) return undefined;
      const [e] = await toEntries([hit]);
      return { label: e.label, serviceName: e.service?.name ?? t('type.personal') };
    },

    /** What a new entry at `start` would run into: who, what and from when to when (at most 3). */
    async overlapsFor(i: { start: string; kind: 'client' | 'personal' | 'expense'; serviceId: string | null; excludeId?: string; minutes?: number }): Promise<OverlapInfo[]> {
      if (i.kind === 'expense') return [];
      const services = await serviceMap();
      const minutes = i.minutes ?? (i.kind === 'personal' ? PERSONAL_MINUTES : i.kind !== 'client' || !i.serviceId ? SHORT_MINUTES : services.get(i.serviceId)?.minutes ?? SHORT_MINUTES);
      const near = await db.appointments.where('start').between(addMinutes(i.start, -1440), addMinutes(i.start, 1440), true, true).toArray();
      const hits = findOverlaps({ id: i.excludeId ?? '', start: i.start, minutes }, near, services).slice(0, 3);
      return (await toEntries(hits)).map((e) => ({ id: e.appt.id, label: e.label, what: e.service?.name ?? (e.appt.kind === 'personal' ? t('type.personal') : ''), start: e.appt.start, end: addMinutes(e.appt.start, e.minutes) }));
    },
    /** The same for an existing entry moved to `start` (its own length). */
    async overlapsOfMove(id: string, start: string): Promise<OverlapInfo[]> {
      const a = await db.appointments.get(id);
      if (!a) return [];
      const services = await serviceMap();
      return this.overlapsFor({ start, kind: a.kind, serviceId: a.serviceId, excludeId: id, minutes: minutesFor(a, services) });
    },
    async entriesBetween(fromDate: string, toDateExclusive: string): Promise<Entry[]> {
      const list = await db.appointments.where('start').between(`${fromDate}T00:00`, `${toDateExclusive}T00:00`, true, false).toArray();
      return toEntries(list.sort(byStart));
    },
    /** One month (YYYY-MM) of money: the expenses entered (newest first), what came in, and the expenses per kind. */
    async monthOverview(ym: string) {
      const [y, m] = ym.split('-').map(Number) as [number, number];
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      const list = (await this.entriesBetween(`${ym}-01`, `${next}-01`)).filter((e) => e.appt.status === 'booked' && e.amountCents !== null);
      const entries = list.filter((e) => e.appt.kind === 'expense').sort((a, b) => b.appt.start.localeCompare(a.appt.start));
      const inCents = list.filter((e) => e.appt.kind === 'client').reduce((s, e) => s + e.amountCents!, 0);
      const outCents = entries.reduce((s, e) => s + e.amountCents!, 0);
      const kinds = new Map<string, number>();
      for (const e of entries) kinds.set(e.label, (kinds.get(e.label) ?? 0) + e.amountCents!);
      const byKind = [...kinds].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents || ltCollator.compare(a.name, b.name));
      // one column per day for the chart, and who paid (largest first) for the dots
      const days = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => ({ date: `${ym}-${String(i + 1).padStart(2, '0')}`, inCents: 0, outCents: 0, paid: 0 }));
      const who = new Map<string, { clientId: string; name: string; cents: number; count: number }>();
      for (const e of list) {
        const d = days[+e.appt.start.slice(8, 10) - 1]!;
        if (e.appt.kind === 'expense') d.outCents += e.amountCents!;
        else if (e.appt.kind === 'client' && e.appt.clientId) {
          d.inCents += e.amountCents!; d.paid += 1;
          const p = who.get(e.appt.clientId) ?? { clientId: e.appt.clientId, name: e.label, cents: 0, count: 0 };
          p.cents += e.amountCents!; p.count += 1; who.set(e.appt.clientId, p);
        }
      }
      const payers = [...who.values()].sort((a, b) => b.cents - a.cents || ltCollator.compare(a.name, b.name));
      return { entries, inCents, outCents, byKind, days, payers };
    },
    async countsByDate(fromDate: string, toDateExclusive: string): Promise<Map<string, number>> {
      const list = await db.appointments.where('start').between(`${fromDate}T00:00`, `${toDateExclusive}T00:00`, true, false).toArray();
      const m = new Map<string, number>();
      for (const a of list) if (a.status === 'booked') m.set(datePart(a.start), (m.get(datePart(a.start)) ?? 0) + 1);
      return m;
    },
    async defaultStartFor(date: string, now_: string = nowLocal()): Promise<string> {
      const s = await this.getSettings();
      if (datePart(now_) !== date) return `${date}T${s.dayStart}`;
      const services = await serviceMap();
      const list = (await db.appointments.where('start').between(`${date}T00:00`, `${addDays(date, 1)}T00:00`, true, false).toArray())
        .filter((a) => a.status === 'booked');
      const blocks: Block[] = list.map((a) => ({ id: a.id, start: a.start, minutes: minutesFor(a, services) }));
      const free = nextFreeSlot(now_, blocks, toMin(s.dayEnd));
      if (datePart(free) > date || minutesOfDay(free) >= toMin(s.dayEnd)) return `${addDays(date, 1)}T${s.dayStart}`;
      if (minutesOfDay(free) < toMin(s.dayStart)) return `${date}T${s.dayStart}`;
      return free;
    },

    /**
     * The contacts list, in the order she needs it: clients waiting for an amount first (the longest-waiting
     * first), then those whose payment she entered in the last two weeks (latest first), then those with a coming
     * visit (soonest first), then everybody else A-Z. The "paid" status shows for two weeks after the visit, then
     * the row falls back to the next visit or the last visit.
     */
    async listClients(now_: string = nowLocal()): Promise<ClientRow[]> {
      const clients = await db.clients.toArray();
      const appts = await db.appointments.toArray();
      const paidFrom = addDays(datePart(now_), -PAID_PILL_DAYS);
      const by = new Map<string, ClientRow>();
      for (const client of clients) by.set(client.id, { client, lastVisit: null, pending: null, paid: null, visitCount: 0, spentCents: 0, nextVisit: null, nextId: null, lastId: null, lastCents: null });
      for (const a of appts) {
        const r = a.clientId ? by.get(a.clientId) : undefined;
        if (!r || a.status === 'cancelled') continue;
        if (a.start <= now_) {
          if (a.status === 'noshow') continue;
          r.visitCount++;
          if (!r.lastVisit || a.start > r.lastVisit) { r.lastVisit = a.start; r.lastId = a.id; r.lastCents = isValidCents(a.amountCents) ? a.amountCents : null; }
          if (isValidCents(a.amountCents)) {
            r.spentCents += a.amountCents;
            if (datePart(a.start) >= paidFrom && (!r.paid || a.start > r.paid.start)) r.paid = { id: a.id, cents: a.amountCents, start: a.start };
          } else if (!r.pending || a.start < r.pending.start) r.pending = { id: a.id, start: a.start };
        } else if (a.status === 'booked' && (!r.nextVisit || a.start < r.nextVisit)) { r.nextVisit = a.start; r.nextId = a.id; }
      }
      const group = (r: ClientRow) => (r.pending ? 0 : r.paid ? 1 : r.nextVisit ? 2 : 3);
      return [...by.values()]
        .map((r): ClientRow => ({ ...r, lastVisit: r.lastVisit ? datePart(r.lastVisit) : null }))
        .sort((a, b) => group(a) - group(b)
          || (group(a) === 0 ? a.pending!.start.localeCompare(b.pending!.start)
            : group(a) === 1 ? b.paid!.start.localeCompare(a.paid!.start)
            : group(a) === 2 ? a.nextVisit!.localeCompare(b.nextVisit!) : 0)
          || ltCollator.compare(a.client.name, b.client.name));
    },
    /** Everything the Analizė page needs, as plain records (the maths is in logic/analytics). */
    async analyticsInput(now_: string = nowLocal()): Promise<AnalyticsInput> {
      const [appts, clients, services, settings] = await Promise.all([db.appointments.toArray(), db.clients.toArray(), serviceMap(), this.getSettings()]);
      const visits: VisitRec[] = [];
      const off: OffRec[] = [];
      for (const a of appts) {
        if (a.kind === 'client' && a.clientId) {
          visits.push({ clientId: a.clientId, start: a.start, status: a.status, cents: isValidCents(a.amountCents) ? a.amountCents : null, service: (a.serviceId ? services.get(a.serviceId)?.name : null) ?? t('service.default.other') });
        } else if (a.kind === 'personal' && a.status === 'booked' && a.title === t('off.title')) off.push({ start: a.start, minutes: a.durationMinutes ?? PERSONAL_MINUTES });
      }
      return { now: now_, visits, off, clients: clients.map((c) => ({ id: c.id, name: c.name })), dayStart: settings.dayStart, dayEnd: settings.dayEnd, workDays: settings.workDays };
    },
    async clientDetail(id: string, now_: string = nowLocal()) {
      const client = await db.clients.get(id);
      if (!client) throw new Error('not-found');
      const all = await db.appointments.where('clientId').equals(id).toArray();
      const entries = await toEntries(all.sort(byStart));
      const upcoming = entries.filter((e) => e.appt.start > now_ && e.appt.status === 'booked');
      const past = entries.filter((e) => e.appt.start <= now_).reverse();
      return {
        client, upcoming, past,
        visitCount: past.filter((e) => e.appt.status === 'booked').length,
        cancelled: entries.filter((e) => e.appt.status === 'cancelled').length,
        noshow: entries.filter((e) => e.appt.status === 'noshow').length,
      };
    },
  };
}
export type Repo = ReturnType<typeof createRepo>;
export const repo = createRepo(db);
