import { useRef } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { openAppt, openNew, repeatFrom } from '../actions';
import { useLive } from '../hooks';
import { statusLabel } from '../status';
import { ui } from '../store';

export function ClientCard({ id }: { id: string }) {
  const d = useLive(() => repo.clientDetail(id), [id], null);
  const nameEl = useRef<HTMLInputElement>(null);
  const phoneEl = useRef<HTMLInputElement>(null);
  const booking = useRef(false);
  if (!d) return null;

  // Writes name and phone when they differ from what is stored, then puts the stored name back
  // in the field, so a refused rename (empty, or another client's name) reverts instead of lingering.
  const save = async () => {
    try {
      const cur = await repo.getClient(id);
      if (!cur) return;
      const name = nameEl.current?.value ?? cur.name;
      const phone = phoneEl.current?.value ?? cur.phone ?? '';
      if (name !== cur.name || phone.trim() !== (cur.phone ?? '')) await repo.updateClient(id, { name, phone });
      const now = await repo.getClient(id);
      if (nameEl.current && now) nameEl.current.value = now.name;
    } catch (e) {
      console.error(e);
    }
  };
  // Saving here as well as on change keeps an edit made just before tapping a button (no blur on iOS).
  const back = async () => {
    await save();
    ui.set({ client: null });
  };
  const book = async () => {
    if (booking.current) return;
    booking.current = true;
    try {
      await save();
      const start = await repo.defaultStartFor(ui.get().date);
      ui.set({ client: null, tab: 'calendar', view: 'day' });
      openNew(start, { clientId: id });
    } catch (e) {
      console.error(e);
    } finally {
      booking.current = false;
    }
  };
  const latest = [...d.upcoming, ...d.past].filter((e) => e.appt.status !== 'cancelled').sort((a, b) => b.appt.start.localeCompare(a.appt.start))[0];
  const visit = (e: (typeof d.upcoming)[number], n: number, prefix: string) => (
    <li key={e.appt.id}>
      <button data-testid={`${prefix}-${n}`} onClick={() => openAppt(e.appt.id)}>
        <span>{formatWhen(e.appt.start)}</span>
        <span>{e.service?.name ?? ''} {statusLabel(e.appt)}</span>
      </button>
    </li>
  );
  return (
    <div class="card-root" data-testid="client-card">
      <header class="navbar">
        <button class="nav-btn" data-testid="card-back" onClick={() => void back()}>{t('nav.back')}</button>
        <button class="nav-btn strong" data-testid="card-book" onClick={() => void book()}>{t('client.book')}</button>
      </header>
      <div class="card-body">
        <input ref={nameEl} class="field name" key={`n${d.client.id}`} data-testid="card-name" defaultValue={d.client.name} onChange={() => void save()} />
        <label class="row"><span class="label">{t('client.phone')}</span>
          <input ref={phoneEl} class="inline" type="tel" data-testid="card-phone" defaultValue={d.client.phone ?? ''} onChange={() => void save()} />
        </label>
        <p class="stat" data-testid="card-visits">{t('client.visitCount', { n: d.visitCount })}</p>
        <p class="stat" data-testid="card-cancelled">{t('client.cancelledCount', { n: d.cancelled })}</p>
        <p class="stat" data-testid="card-noshow">{t('client.noshowCount', { n: d.noshow })}</p>
        {latest && <button class="action-row" data-testid="card-repeat" onClick={() => repeatFrom(latest.appt)}>{t('repeat.action')}</button>}
        <p class="label">{t('client.upcoming')}</p>
        <ul class="visits">{d.upcoming.length ? d.upcoming.map((e, n) => visit(e, n, 'upcoming')) : <li class="muted">{t('client.none')}</li>}</ul>
        <p class="label">{t('client.past')}</p>
        <ul class="visits">{d.past.length ? d.past.map((e, n) => visit(e, n, 'visit')) : <li class="muted">{t('client.none')}</li>}</ul>
      </div>
    </div>
  );
}
