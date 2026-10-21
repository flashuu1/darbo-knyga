import type { CSSProperties } from 'preact';
import { useRef } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { openAppt, openNew, primeKeyboard, rebook } from '../actions';
import { useLive } from '../hooks';
import { statusLabel } from '../status';
import { BackIcon, NextIcon } from '../icons';
import { ui } from '../store';
import { initials } from './Clients';

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
      // Only revert what this save read: a name typed meanwhile (e.g. right after the phone) is kept.
      if (nameEl.current && now && nameEl.current.value === name) nameEl.current.value = now.name;
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
    primeKeyboard(); // before the awaits, while still inside the tap
    try {
      await save();
      const start = await repo.defaultStartFor(ui.get().date);
      ui.set({ client: null, tab: 'calendar', view: 'day' });
      openNew(start, { clientId: id });
    } catch (e) {
      console.error(e);
      (document.activeElement as HTMLElement | null)?.blur(); // drop the primed keyboard
    } finally {
      booking.current = false;
    }
  };
  const latest = [...d.upcoming, ...d.past].filter((e) => e.appt.status !== 'cancelled').sort((a, b) => b.appt.start.localeCompare(a.appt.start))[0];
  const visit = (e: (typeof d.upcoming)[number], n: number, prefix: string) => (
    <li key={e.appt.id}>
      <button class="visit-row" data-testid={`${prefix}-${n}`} style={{ '--svc': `var(--c-${e.color})` } as CSSProperties} onClick={() => openAppt(e.appt.id)}>
        <span class="visit-bar" aria-hidden="true" />
        <span class="visit-text">
          <b>{formatWhen(e.appt.start)}</b>
          <span>{e.service?.name ?? ''} · {statusLabel(e.appt)}</span>
        </span>
        <span class="chev"><NextIcon /></span>
      </button>
    </li>
  );
  return (
    <div class="card-root push-in" data-testid="client-card">
      <header class="chrome">
        <div class="navbar">
          <button class="nav-btn back" data-testid="card-back" onClick={() => void back()}><BackIcon /><span>{t('nav.back')}</span></button>
          <button class="nav-btn strong" data-testid="card-book" onClick={() => void book()}>{t('client.book')}</button>
        </div>
      </header>
      <div class="scroll card-body">
        <div class="card-hero">
          <span class="avatar big" aria-hidden="true">{initials(d.client.name)}</span>
          <input ref={nameEl} class="hero-name" key={`n${d.client.id}`} data-testid="card-name" defaultValue={d.client.name} autocomplete="off" onChange={() => void save()} />
        </div>
        <div class="group">
          <label class="group-row"><span>{t('client.phone')}</span>
            <input ref={phoneEl} class="inline" type="tel" data-testid="card-phone" defaultValue={d.client.phone ?? ''} onChange={() => void save()} />
          </label>
        </div>
        <div class="group stats">
          <p class="group-row text" data-testid="card-visits">{t('client.visitCount', { n: d.visitCount })}</p>
          <p class="group-row text" data-testid="card-cancelled">{t('client.cancelledCount', { n: d.cancelled })}</p>
          <p class="group-row text" data-testid="card-noshow">{t('client.noshowCount', { n: d.noshow })}</p>
        </div>
        {latest && <div class="group"><button class="group-row accent" data-testid="card-repeat" onClick={() => rebook(latest.appt, { type: 'client', id })}>{t('repeat.action')}</button></div>}
        <h2 class="section-head">{t('client.upcoming')}</h2>
        <ul class="group visits">{d.upcoming.length ? d.upcoming.map((e, n) => visit(e, n, 'upcoming')) : <li class="group-row text muted">{t('client.none')}</li>}</ul>
        <h2 class="section-head">{t('client.past')}</h2>
        <ul class="group visits">{d.past.length ? d.past.map((e, n) => visit(e, n, 'visit')) : <li class="group-row text muted">{t('client.none')}</li>}</ul>
      </div>
    </div>
  );
}
