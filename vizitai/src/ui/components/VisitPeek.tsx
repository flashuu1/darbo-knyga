import type { CSSProperties } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import { formatDayShort, formatEuro, weekdayName } from '../../i18n/format';
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
  const busy = useRef(false);
  const [h, setH] = useState(0);
  // The card is placed once its height is known: centred on the row that was held, kept clear of the screen edges.
  useLayoutEffect(() => { if (card.current) setH(card.current.offsetHeight); }, [kind, suggest.length, !!client?.phone, !!detail]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
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

  async function pay(cents: number) {
    if (busy.current) return;
    busy.current = true;
    try {
      const { before } = await repo.setAmount(appt!.id, cents);
      showToast(t('amount.saved'), () => repo.putSnapshot(before));
    } catch (e) { console.error(e); } finally { busy.current = false; }
  }
  function other() { openAmount(appt!.id); close(); } // synchronously, so the number keyboard comes up
  function toCalendar() { ui.set({ peek: null, client: null, tab: 'calendar', view: 'day', date }); highlight(appt!.id); }

  return (
    <div class="layer peek-layer" data-leaving={leaving ? '' : undefined} data-testid="peek-layer">
      <div class="peek-back" onMouseDown={(e) => e.preventDefault()} onClick={close} data-testid="peek-back" />
      <div ref={card} class={`peek-card peek-${kind}`} role="dialog" aria-label={name} data-testid="peek" data-state={kind} data-ready={h > 0 ? '' : undefined}
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
          {paid && <li class="money paid"><span class="peek-amt" data-testid="peek-amount">{formatEuro(amount)}</span><em>{t('pk.paid')}</em></li>}
          {kind === 'unconfirmed' && <li class="money due"><span class="peek-amt dim">{t('pk.noAmount')}</span></li>}
          {client?.phone?.trim() && <li><span class="peek-ico" aria-hidden="true"><PhoneIcon /></span><a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} data-testid="peek-phone">{client.phone}</a></li>}
          {detail && <li class="quiet"><span>{t('pk.visits', { n: detail.visitCount })}</span></li>}
        </ul>

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
