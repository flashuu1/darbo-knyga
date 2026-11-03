import type { CSSProperties } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
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
  const root = useRef<HTMLDivElement>(null);
  const backRef = useRef<() => void>(() => {});
  // A swipe to the right anywhere on the card (not on a field, where it moves the cursor) drags the card away with the
  // finger and goes back to the list, as the button does. A short or mostly vertical drag does nothing.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let g: { id: number; x0: number; y0: number; t0: number; on: boolean } | null = null;
    const down = (e: PointerEvent) => { g = !e.isPrimary || (e.target as HTMLElement).closest('input, textarea') ? null : { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), on: false }; };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.on) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // she is scrolling
        if (dx < 14 || dx < Math.abs(dy) * 1.5) return;
        g.on = true;
        el.style.transition = 'none';
      }
      el.style.transform = `translateX(${Math.max(0, dx)}px)`;
    };
    const up = (e: PointerEvent) => {
      const s = g;
      g = null;
      if (!s || !s.on || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x0, fast = dx / Math.max(1, performance.now() - s.t0) > 0.5;
      const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      el.addEventListener('click', eat, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', eat, true), 120);
      if (dx > 110 || (fast && dx > 50)) {
        el.style.transition = 'transform .28s var(--ease-spring)';
        el.style.transform = 'translateX(100%)';
        window.setTimeout(() => backRef.current(), 230);
      } else {
        el.style.transition = 'transform .38s var(--ease-spring)';
        el.style.transform = '';
      }
    };
    const cancel = () => { if (g?.on) { el.style.transition = 'transform .3s var(--ease-spring)'; el.style.transform = ''; } g = null; };
    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', cancel, { passive: true });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
  }, [!d]);
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
  backRef.current = () => void back();
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
    <div ref={root} class="card-root push-in" data-testid="client-card">
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
