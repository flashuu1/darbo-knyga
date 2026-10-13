import { newId } from '../logic/id';
import { db } from './db';
import type { Appointment, CancelReason, Client, Service, ServiceColor, Settings } from './types';
import type { VizitaiDB } from './db';
import { DEFAULT_SETTINGS } from './seed';
import { cleanName, foldName, ltCollator } from '../logic/names';
import { addDays, addMinutes, datePart, minutesOfDay, nowLocal, snap } from '../logic/time';
import { findOverlap, minutesFor, nextFreeSlot, PERSONAL_MINUTES, type Block } from '../logic/overlap';
import { t } from '../i18n/lt';

export interface Entry { appt: Appointment; label: string; service: Service | null; minutes: number; color: ServiceColor }
const SLOT = 15;
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
      return { appt, label, service, minutes: minutesFor(appt, services), color: service?.color ?? 'gray' };
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
    async searchClients(query: string, limit = 8): Promise<Client[]> {
      const q = foldName(query);
      if (!q) return this.recentClients(5);
      const all = await db.clients.toArray();
      return all.filter((c) => c.nameKey.includes(q)).sort((a, b) => ltCollator.compare(a.name, b.name)).slice(0, limit);
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
      const start = snap(i.start, SLOT);
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
      const target = snap(to, SLOT);
      return mutate(id, (a) => ({ ...a, start: target, moves: [...a.moves, { at: now(), from: a.start, to: target }] }));
    },
    cancelAppointment(id: string, reason: CancelReason | null) {
      return mutate(id, (a) => ({ ...a, status: 'cancelled', cancelReason: reason, cancelledAt: now() }));
    },
    markNoShow(id: string) { return mutate(id, (a) => ({ ...a, status: 'noshow' })); },
    restoreAppointment(id: string) { return mutate(id, (a) => ({ ...a, status: 'booked', cancelReason: null, cancelledAt: null })); },
    async putSnapshot(a: Appointment) { await db.appointments.put(a); },

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

    async listClients(now_: string = nowLocal()): Promise<{ client: Client; lastVisit: string | null }[]> {
      const clients = await db.clients.toArray();
      const appts = await db.appointments.toArray();
      const last = new Map<string, string>();
      for (const a of appts) {
        if (!a.clientId || a.status === 'cancelled' || a.start > now_) continue;
        if (!last.has(a.clientId) || a.start > last.get(a.clientId)!) last.set(a.clientId, a.start);
      }
      return clients.sort((a, b) => ltCollator.compare(a.name, b.name)).map((client) => ({ client, lastVisit: last.has(client.id) ? datePart(last.get(client.id)!) : null }));
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
