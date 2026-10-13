import { newId } from '../logic/id';
import { db } from './db';
import type { Appointment, CancelReason, Client, Service, ServiceColor, Settings } from './types';
import type { VizitaiDB } from './db';
import { DEFAULT_SETTINGS } from './seed';
import { cleanName, foldName, ltCollator } from '../logic/names';
import { addDays, addMinutes, datePart, minutesOfDay, nowLocal, parse } from '../logic/time';
import { findOverlap, minutesFor, nextFreeSlot, PERSONAL_MINUTES, type Block } from '../logic/overlap';
import { t } from '../i18n/lt';
import { isValidCents } from '../logic/amount';

/** One row of the contacts list (see listClients). */
export interface ClientRow {
  client: Client;
  /** Date (YYYY-MM-DD) of the last visit that took place. */
  lastVisit: string | null;
  /** The longest-waiting past visit that still has no amount. */
  pending: { id: string; start: string } | null;
  /** Sum of the amounts entered for visits in the current month. */
  paidCents: number;
  /** Start of the next booked visit. */
  nextVisit: string | null;
}
/** How long a cancelled visit stays visible before it is removed. */
export const CANCELLED_KEEP_DAYS = 7;
export interface Entry { appt: Appointment; label: string; service: Service | null; minutes: number; color: ServiceColor; amountCents: number | null }
const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

export function createRepo(db: VizitaiDB) {
  let lastTs = 0; // strictly increasing, so "most recent" ordering never ties within a millisecond
  const now = () => { lastTs = Math.max(Date.now(), lastTs + 1); return new Date(lastTs).toISOString(); };
  const uuid = newId;
  const serviceMap = async () => new Map((await db.services.toArray()).map((s) => [s.id, s]));

  async function toEntries(list: Appointment[]): Promise<Entry[]> {
    const services = await serviceMap();
    const ids = [...new Set(list.map((a) => a.clientId).filter((x): x is string => !!x))];
    const clients = new Map((await db.clients.bulkGet(ids)).filter((c): c is Client => !!c).map((c) => [c.id, c]));
    return list.map((appt) => {
      const service = appt.serviceId ? services.get(appt.serviceId) ?? null : null;
      const label = appt.kind === 'personal' ? appt.title ?? '' : clients.get(appt.clientId ?? '')?.name ?? '';
      return { appt, label, service, minutes: minutesFor(appt, services), color: service?.color ?? 'gray', amountCents: isValidCents(appt.amountCents) ? appt.amountCents : null };
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
    async updateService(id: string, p: Partial<Pick<Service, 'name' | 'color' | 'minutes'>>) {
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

    async createAppointment(i: { kind: 'client' | 'personal'; name?: string; title?: string; serviceId?: string | null; start: string }): Promise<Appointment> {
      parse(i.start); // throws on a malformed time; any minute is allowed (the time wheel is not limited to a grid)
      const start = i.start;
      let clientId: string | null = null, title: string | null = null;
      if (i.kind === 'client') clientId = (await this.matchOrCreateClient(i.name ?? '')).id;
      else { title = cleanName(i.title ?? ''); if (!title) throw new Error('empty-title'); }
      const ts = now();
      const a: Appointment = {
        id: uuid(), kind: i.kind, clientId, title, serviceId: i.kind === 'client' ? i.serviceId ?? null : null, start,
        status: 'booked', cancelReason: null, cancelledAt: null, moves: [], createdAt: ts, updatedAt: ts,
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
      return mutate(id, (a) => ({ ...a, amountCents: cents }));
    },
    async putSnapshot(a: Appointment) { await db.appointments.put(a); },
    deleteAppointment: (id: string) => db.appointments.delete(id),
    /** Cancelled visits that have not been purged yet, newest cancellation first. */
    async cancelledEntries(): Promise<Entry[]> {
      const list = (await db.appointments.where('status').equals('cancelled').toArray()).sort((a, b) => (b.cancelledAt ?? '').localeCompare(a.cancelledAt ?? ''));
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

    async findOverlapFor(i: { start: string; kind: 'client' | 'personal'; serviceId: string | null; excludeId?: string }) {
      const services = await serviceMap();
      const minutes = i.kind === 'personal' || !i.serviceId ? PERSONAL_MINUTES : services.get(i.serviceId)?.minutes ?? PERSONAL_MINUTES;
      const lo = addMinutes(i.start, -1440), hi = addMinutes(i.start, 1440);
      const near = await db.appointments.where('start').between(lo, hi, true, true).toArray();
      const hit = findOverlap({ id: i.excludeId ?? '', start: i.start, minutes }, near, services);
      if (!hit) return undefined;
      const [e] = await toEntries([hit]);
      return { label: e.label, serviceName: e.service?.name ?? t('type.personal') };
    },

    async entriesBetween(fromDate: string, toDateExclusive: string): Promise<Entry[]> {
      const list = await db.appointments.where('start').between(`${fromDate}T00:00`, `${toDateExclusive}T00:00`, true, false).toArray();
      return toEntries(list.sort(byStart));
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
     * first), then those who already paid this month (latest first), then those with a coming visit (soonest
     * first), then everybody else A-Z. "Paid" shows until the end of the month, then the row falls back to
     * the next visit or nothing.
     */
    async listClients(now_: string = nowLocal()): Promise<ClientRow[]> {
      const clients = await db.clients.toArray();
      const appts = await db.appointments.toArray();
      const month = now_.slice(0, 7);
      const by = new Map<string, ClientRow & { paidLast: string }>();
      for (const client of clients) by.set(client.id, { client, lastVisit: null, pending: null, paidCents: 0, nextVisit: null, paidLast: '' });
      for (const a of appts) {
        const r = a.clientId ? by.get(a.clientId) : undefined;
        if (!r || a.status === 'cancelled') continue;
        if (a.start <= now_) {
          if (a.status === 'noshow') continue;
          if (!r.lastVisit || a.start > r.lastVisit) r.lastVisit = a.start;
          if (isValidCents(a.amountCents)) {
            if (a.start.startsWith(month)) { r.paidCents += a.amountCents; if (a.start > r.paidLast) r.paidLast = a.start; }
          } else if (!r.pending || a.start < r.pending.start) r.pending = { id: a.id, start: a.start };
        } else if (a.status === 'booked' && (!r.nextVisit || a.start < r.nextVisit)) r.nextVisit = a.start;
      }
      const group = (r: ClientRow) => (r.pending ? 0 : r.paidCents > 0 ? 1 : r.nextVisit ? 2 : 3);
      return [...by.values()]
        .map((r): ClientRow & { paidLast: string } => ({ ...r, lastVisit: r.lastVisit ? datePart(r.lastVisit) : null }))
        .sort((a, b) => group(a) - group(b)
          || (group(a) === 0 ? a.pending!.start.localeCompare(b.pending!.start)
            : group(a) === 1 ? b.paidLast.localeCompare(a.paidLast)
            : group(a) === 2 ? a.nextVisit!.localeCompare(b.nextVisit!) : 0)
          || ltCollator.compare(a.client.name, b.client.name))
        .map((r): ClientRow => ({ client: r.client, lastVisit: r.lastVisit, pending: r.pending, paidCents: r.paidCents, nextVisit: r.nextVisit }));
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
