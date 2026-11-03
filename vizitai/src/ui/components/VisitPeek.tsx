import type { CSSProperties } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatDayShort, formatEuro, formatEuroShort, weekdayName } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { addMinutes, datePart, nowLocal, timePart } from '../../logic/time';
import { highlight, showToast } from '../actions';
import { openAmount } from '../amount';
import { useLive, useServices } from '../hooks';
import { CalendarIcon, CheckIcon, PhoneIcon } from '../icons';
import { agoText, initials } from '../screens/Clients';
import { statusKind, type StatusKind } from '../status';
import { ui, type PeekState } from '../store';

const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const close = () => ui.set({ peek: null });
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A small card that floats over the list while a client's row is held (like holding an app icon on the Home Screen): what
 * that one visit is, at a glance. It is for looking: the visit is changed only in the calendar ("Rodyti kalendoriuje" goes
 * there). One card for four situations: a visit still ahead, one that took place and waits for its amount (the amount can
 * be put in right here, from the amounts this client paid before), one with its payment confirmed, and one that did not
 * happen (no-show or cancelled). No service chips and none of the visit sheet's other choices.
 */
export function VisitPeek({ peek, leaving }: { peek: PeekState; leaving: boolean }) {
  const appt = useLive(() => repo.getAppointment(peek.id), [peek.id], undefined);
  const client = useLive(async () => (appt?.clientId ? repo.getClient(appt.clientId) : undefined), [appt?.clientId], undefined);
  const services = useServices(false);
  const detail = useLive(async () => (appt?.clientId ? repo.clientDetail(appt.clientId) : null), [appt?.clientId], null);
  const kind: StatusKind | null = appt ? statusKind(appt) : null;
  const suggest = useLive(async () => (appt?.clientId && kind === 'unconfirmed' ? repo.amountSuggestions(appt.clientId, appt.serviceId) : []), [appt?.clientId, appt?.serviceId, kind], [] as number[]);
  const card = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const flying = useRef(false);
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; on: boolean } | null>(null);
  const off = useRef({ x: 0, y: 0 });       // how far the card is dragged from its place
  const scaleNow = useRef(1);
  const samples = useRef<{ t: number; x: number; y: number }[]>([]);
  const [h, setH] = useState(0);
  // The card is placed once its height is known: centred on the row that was held, kept clear of the screen edges.
  useLayoutEffect(() => { if (card.current) setH(card.current.offsetHeight); }, [kind, suggest.length, !!client?.phone, !!detail]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') flyAway(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  // The visit was deleted behind the card: nothing to show
  useEffect(() => { if (appt === undefined && !leaving) { const id = window.setTimeout(() => { if (!ui.get().peek) return; repo.getAppointment(peek.id).then((a) => { if (!a) close(); }); }, 300); return () => clearTimeout(id); } }, [appt]);
  if (!appt || !kind) return null;

  const service = services.find((s) => s.id === appt.serviceId);
  const minutes = service?.minutes ?? 15;
  const date = datePart(appt.start), today = datePart(nowLocal());
  const gap = dayGap(today, date);
  const when = kind === 'waiting'
    ? (gap <= 0 ? t('pk.today') : gap === 1 ? t('pk.tomorrow') : gap < 14 ? t('pk.inDays', { n: gap }) : t('pk.inWeeks', { n: Math.round(gap / 7) }))
    : agoText(date, nowLocal());
  const name = client?.name ?? '';
  const amount = typeof appt.amountCents === 'number' ? appt.amountCents : null;
  const chip = { waiting: 'pk.upcoming', unconfirmed: 'client.pending', done: 'pk.paid', noshow: 'status.noshow', cancelled: 'status.cancelled' } as const;
  const paid = kind === 'done' && amount !== null;
  const center = peek.top + peek.height / 2;
  // The other side of the story: for a visit that took place, the next one; for one that is still ahead, the last one
  // (so a client who paid and is coming again shows both), and how many more visits still wait for their amount.
  const nextE = detail?.upcoming.find((e) => e.appt.id !== appt.id) ?? null;
  const lastE = detail?.past.find((e) => e.appt.id !== appt.id && e.appt.status === 'booked') ?? null;
  const side = kind === 'waiting' ? lastE : nextE;
  const moreUnpaid = (detail?.past ?? []).filter((e) => e.appt.id !== appt.id && e.appt.status === 'booked' && e.amountCents === null).length;

  async function pay(cents: number) {
    if (busy.current) return;
    busy.current = true;
    try {
      const { before } = await repo.setAmount(appt!.id, cents);
      showToast(t('amount.saved'), () => repo.putSnapshot(before));
    } catch (e) { console.error(e); } finally { busy.current = false; }
  }
  function other() { openAmount(appt!.id); close(); } // synchronously, so the number keyboard comes up (also to change an amount that is already in)
  /**
   * The card is let go: it keeps the speed of the finger and is drawn into the avatar or pill it came out of, like a
   * spring pulling it home; it shrinks as it gets there and only disappears in the last moment, when it is "inside".
   * (Tap outside and Escape do the same from rest.) vx, vy: the speed of the finger, px per millisecond.
   */
  function flyAway(vx = 0, vy = 0) {
    const el = card.current;
    if (flying.current) return;
    flying.current = true;
    if (!el || reduced()) { close(); return; }
    el.setAttribute('data-flying', '');
    const r = el.getBoundingClientRect(), o = off.current;
    const tx = peek.from.x - (r.left + r.width / 2 - o.x), ty = peek.from.y - (r.top + r.height / 2 - o.y); // offset that puts the card's centre on the source
    const startScale = scaleNow.current, backStart = back.current ? Number(back.current.style.opacity || 1) : 1;
    const total = Math.max(1, Math.hypot(tx - o.x, ty - o.y));
    const K = 300, C = 2 * Math.sqrt(K) * 0.88; // a firm spring that hardly overshoots
    const t0 = performance.now();
    let x = o.x, y = o.y, sx = vx * 1000, sy = vy * 1000, last = t0;
    // a flick away from the source is only partly kept (most of that speed is taken out), so the card curves home instead of swinging out and back
    const ux = (tx - x) / total, uy = (ty - y) / total, along = sx * ux + sy * uy;
    if (along < 0) { sx -= along * ux * 0.7; sy -= along * uy * 0.7; }
    el.style.transition = 'none';
    if (back.current) back.current.style.transition = 'none';
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; // the cap allows 30 Hz frames (33 ms) without slowing the motion
      sx += (K * (tx - x) - C * sx) * dt; sy += (K * (ty - y) - C * sy) * dt;
      x += sx * dt; y += sy * dt;
      const p = Math.min(1, Math.max(0, 1 - Math.hypot(tx - x, ty - y) / total));
      const sc = startScale + (0.16 - startScale) * (p * p * (3 - 2 * p));
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
      el.style.opacity = String(p < 0.78 ? 1 : Math.max(0, 1 - (p - 0.78) / 0.2));
      if (back.current) back.current.style.opacity = String(backStart * Math.max(0, 1 - p * 1.15));
      if (p >= 0.985 || now - t0 > 700) { close(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const down = (e: PointerEvent) => { if (!flying.current && e.isPrimary) { drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), on: false }; samples.current = []; } };
  const move = (e: PointerEvent) => {
    const d = drag.current, el = card.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0, dist = Math.hypot(dx, dy);
    if (!d.on) {
      if (dist < 8) return;
      d.on = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
      el.style.transition = 'none';
    }
    const sc = 1 - Math.min(0.1, dist / 2200);
    off.current = { x: dx, y: dy }; scaleNow.current = sc;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
    if (back.current) { back.current.style.transition = 'none'; back.current.style.opacity = String(1 - Math.min(0.7, dist / 420)); }
    const smp = samples.current; smp.push({ t: performance.now(), x: dx, y: dy }); if (smp.length > 6) smp.shift();
  };
  const up = (e: PointerEvent) => {
    const d = drag.current, el = card.current;
    drag.current = null;
    if (!d || !el || e.pointerId !== d.id || !d.on) return;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    // the speed of the finger over its last moments
    const smp = samples.current, a = smp[0], z = smp[smp.length - 1];
    const dtv = a && z ? Math.max(1, z.t - a.t) : 1, vx = a && z ? (z.x - a.x) / dtv : 0, vy = a && z ? (z.y - a.y) / dtv : 0;
    const speed = Math.hypot(vx, vy);
    const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); }; // the tap that would follow a drag
    el.addEventListener('click', eat, { capture: true, once: true });
    window.setTimeout(() => el.removeEventListener('click', eat, true), 120);
    if (dist > 90 || (speed > 0.6 && dist > 40)) { flyAway(vx, vy); return; } // far enough, or a quick flick
    off.current = { x: 0, y: 0 }; scaleNow.current = 1;
    el.style.transition = 'transform .4s var(--ease-spring)'; // not far enough: back to its place
    el.style.transform = '';
    if (back.current) { back.current.style.transition = 'opacity .3s'; back.current.style.opacity = ''; }
  };
  function toCalendar() { ui.set({ peek: null, client: null, tab: 'calendar', view: 'day', date }); highlight(appt!.id); }

  return (
    <div class="layer peek-layer" data-leaving={leaving ? '' : undefined} data-testid="peek-layer">
      <div ref={back} class="peek-back" onMouseDown={(e) => e.preventDefault()} onClick={() => flyAway()} data-testid="peek-back" />
      <div ref={card} class={`peek-card peek-${kind}`} role="dialog" aria-label={name} data-testid="peek" data-state={kind} data-ready={h > 0 ? '' : undefined}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ '--peek-center': `${center}px`, '--peek-h': `${h}px`, '--svc': `var(--c-${service?.color ?? 'gray'})` } as CSSProperties}>
        <header class="peek-head">
          <span class="avatar" aria-hidden="true">{initials(name)}</span>
          <span class="peek-name" data-testid="peek-name">{name}</span>
          <span class={`peek-chip ${kind}`} data-testid="peek-status">{kind === 'done' && <CheckIcon />}{t(chip[kind])}</span>
        </header>

        <div class="peek-when">
          <p class="peek-date" data-testid="peek-date">{weekdayName((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7)}, {formatDayShort(date)}</p>
          <p class="peek-time" data-testid="peek-time">{t('pk.range', { nuo: timePart(appt.start), iki: timePart(addMinutes(appt.start, minutes)) })}</p>
          <p class="peek-rel">{when}</p>
        </div>

        <ul class="peek-rows">
          <li><i class="peek-dot" aria-hidden="true" /><span data-testid="peek-service">{service?.name ?? t('service.default.other')}{service?.floral ? ' 🌸' : ''}</span><em>{t('appt.minutes', { n: minutes })}</em></li>
          {paid && <li class="money paid"><span class="peek-amt" data-testid="peek-amount">{formatEuro(amount)}</span><em>{t('pk.paid')}</em><button class="peek-edit" data-testid="peek-edit" onClick={other}>{t('pk.edit')}</button></li>}
          {kind === 'unconfirmed' && <li class="money due"><span class="peek-amt dim">{t('pk.noAmount')}</span></li>}
          {client?.phone?.trim() && <li><span class="peek-ico" aria-hidden="true"><PhoneIcon /></span><a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} data-testid="peek-phone">{client.phone}</a></li>}
          {detail && <li class="quiet"><span>{t('pk.visits', { n: detail.visitCount })}</span></li>}
        </ul>
        {moreUnpaid > 0 && kind !== 'waiting' && <p class="peek-note" data-testid="peek-more-unpaid">{t('pk.moreUnpaid', { n: moreUnpaid })}</p>}

        {side && (
          <div class="peek-side" data-testid={kind === 'waiting' ? 'peek-last' : 'peek-next'}>
            <small>{kind === 'waiting' ? t('pk.lastVisit') : t('pk.nextVisit')}</small>
            <b>{weekdayName((new Date(`${datePart(side.appt.start)}T12:00:00Z`).getUTCDay() + 6) % 7)}, {formatDayShort(datePart(side.appt.start))} · {timePart(side.appt.start)}</b>
            <span>
              {side.service?.name ?? t('service.default.other')}
              {side.amountCents !== null ? <em class="paid"> · ✓ {formatEuroShort(side.amountCents)}</em> : kind === 'waiting' && side.appt.start <= nowLocal() ? <em class="due"> · {t('client.pending')}</em> : null}
            </span>
          </div>
        )}

        {kind === 'unconfirmed' && (
          <div class="peek-pay" data-testid="peek-pay">
            {suggest.map((c, i) => <button key={c} class="peek-amtchip" data-testid={`peek-chip-${i}`} onClick={() => void pay(c)}>{formatEuro(c)}</button>)}
            <button class="peek-amtchip other" data-testid="peek-other" onClick={other}>{t('pk.other')}</button>
          </div>
        )}

        <button class="peek-cal" data-testid="peek-calendar" onClick={toCalendar}><CalendarIcon />{t('pk.calendar')}</button>
      </div>
    </div>
  );
}
