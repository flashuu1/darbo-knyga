import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo, type ClientSuggestion } from '../../db/repo';
import type { Client } from '../../db/types';
import { euroSign, formatAmountInput, formatDayShort, formatEuroShort, formatWhen, parseAmountInput } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { glyphFor, serviceGlyph } from '../../logic/glyph';
import { cleanName, foldName } from '../../logic/names';
import { datePart, hhmm, minutesOfDay, nowLocal } from '../../logic/time';
import { closeSheet, confirmOverlap, highlight } from '../actions';
import { useLive, useOptions, useServices } from '../hooks';
import { CheckIcon, NextIcon } from '../icons';
import { useKeyboardHeight } from '../keyboard';
import { agoText, initials } from '../screens/Clients';
import { useSideSwipe } from '../sideSwipe';
import { ui, type Origin } from '../store';
import { DateTimePicker } from './DateTimePicker';
import { LiquidSeg } from './Segmented';
import { Sheet } from './Sheet';

// Enough to find someone as the client list grows, few enough to stay clear of the keyboard.
const MAX_SUGGESTIONS = 8;
type Kind = 'client' | 'personal' | 'expense';
type Screen = 0 | 1 | 2; // 0 = client, 1 = service, 2 = time (Nedirbu: from, then to, on the same screen)

/**
 * New booking as three screens inside one full-height modal:
 *   0 Klientas (name + recents, keyboard)  ->  1 Paslauga (service cards)  ->  2 Laikas (calendar + times)
 * Nothing resizes when the keyboard opens: the name field is at the top and only screen 0 has a keyboard.
 */
export function NewFlow({ prefill }: { prefill: { start: string; clientId?: string; serviceId?: string; screen?: 'time'; from?: Origin; replaceId?: string } }) {
  const services = useServices(true);
  const kb = useKeyboardHeight();
  const [screen, setScreen] = useState<Screen>(prefill.screen === 'time' ? 2 : 0);
  const [kind, setKind] = useState<Kind>('client');
  const [slide, setSlide] = useState<'next' | 'prev' | ''>(''); // which way the choices of the new type slide in from
  const pane0 = useRef<HTMLElement>(null);
  const amountBlock = useRef<HTMLDivElement>(null);
  const [amountFocus, setAmountFocus] = useState(false);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [off, setOff] = useState(false); // Asmeninis > Nedirbu: from a time to a time, nothing else
  const [toTime, setToTime] = useState('');
  const [offStep, setOffStep] = useState<'from' | 'to'>('from'); // which end of Nedirbu is being set
  const [name, setName] = useState('');
  const [linked, setLinked] = useState<Client | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(prefill.serviceId ?? null);
  const [start, setStart] = useState(prefill.start);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const typed = useRef(false); // she has typed in or picked into the name field
  const matches = useLive(() => repo.suggestClients(name, MAX_SUGGESTIONS + 1), [name], [] as ClientSuggestion[]);
  // A prefilled/last service may since have been hidden: fall back to the first card.
  const sid = services.some((s) => s.id === serviceId) ? serviceId : services[0]?.id ?? null;
  const hasName = cleanName(name).length > 0;
  const options = useOptions(kind === 'expense' ? 'expense' : 'personal');
  const chosen = kind === 'client' ? null : options.find((o) => o.id === optionId) ?? null;
  const cents = parseAmountInput(amountText);
  const usual = kind === 'expense' && chosen?.costCents != null ? chosen.costCents : null; // the kind's fixed amount: the field starts with it and she confirms or changes it
  // The first screen is done when she has a name (client) or has picked one of her own choices (and an amount for an expense).
  const canNext = kind === 'client' ? hasName : kind === 'personal' ? chosen !== null || off : chosen !== null && cents !== null;
  const canSave = canNext && (kind !== 'client' || sid !== null);
  // Nedirbu: the end must come after the start, on the same day
  const fromMin = minutesOfDay(start);
  const toMinutes = toTime ? +toTime.slice(0, 2) * 60 + +toTime.slice(3, 5) : 0;
  const offValid = off && toMinutes > fromMin;

  // The tap that opened the flow focused the hidden primer (the iOS keyboard is up); hand focus to the field.
  useEffect(() => { if (screen === 0) input.current?.focus(); }, []);
  useEffect(() => {
    if (!prefill.clientId) return;
    void repo.getClient(prefill.clientId).then(async (c) => {
      if (!c) return;
      setLinked(c); setName(c.name);
      if (!prefill.serviceId) { const last = await repo.lastServiceId(c.id); if (last) setServiceId(last); } // smart default: their last service
    });
  }, []);

  const KINDS = ['client', 'personal', 'expense'] as const;
  const chooseKind = (k: Kind) => {
    if (k !== kind) setSlide(KINDS.indexOf(k) > KINDS.indexOf(kind) ? 'next' : 'prev');
    setKind(k); setOptionId(null); setOff(false); setOffStep('from'); setLinked(null);
  };
  // a swipe on the first screen moves between Klientas, Asmeninis and Išlaidos (and the glass drop follows)
  useSideSwipe(pane0, (dir) => { const k = KINDS[KINDS.indexOf(kind) + dir]; if (k && screen === 0) chooseKind(k); });
  // The amount field is the last thing under a long list of kinds. When the keyboard comes up the first screen shrinks to what is above
  // the keyboard and the blue button: the field (and its note) is scrolled into that part, not left under the button.
  useEffect(() => {
    if (!amountFocus) return;
    const h = window.setTimeout(() => {
      const p = pane0.current, b = amountBlock.current;
      if (!p || !b) return;
      const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect();
      const d = br.bottom > pr.bottom - 12 ? br.bottom - (pr.bottom - 12) : br.top < pr.top + 8 ? br.top - (pr.top + 8) : 0;
      if (Math.abs(d) > 1) p.scrollBy({ top: d, behavior: 'smooth' });
    }, 140);
    return () => clearTimeout(h);
  }, [amountFocus, kb]);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); };
  const go = (s: Screen) => { if (s !== 0) input.current?.blur(); setScreen(s); };
  const next = () => { if (canNext) go(kind === 'client' ? 1 : 2); };
  // Dragging the list while the keyboard is up puts the keyboard away (like iOS lists), so the whole list can be scrolled and seen.
  const touchY = useRef(0);
  const dismissOnDrag = (e: TouchEvent) => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && Math.abs(e.touches[0]!.clientY - touchY.current) > 10) el.blur();
  };
  // Started from "Užregistruoti į priekį": backing out (Atgal or a swipe down) returns to the appointment sheet or
  // client card it came from, not through the service and name screens.
  const origin = prefill.screen === 'time' ? prefill.from : undefined;
  const leave = () => { if (origin?.type === 'appt') ui.set({ sheet: { type: 'appt', id: origin.id } }); else closeSheet(); };
  const back = () => {
    if (off && screen === 2 && offStep === 'to') { setOffStep('from'); return; } // Nedirbu: from "iki" back to "nuo", same screen
    if (screen === 2 && origin) leave(); else go(screen === 2 ? (kind === 'client' ? 1 : 0) : 0);
  };
  // Nedirbu, "nuo" done: now "iki", on the same screen; the end starts an hour after the start (or the last minute of the day)
  const toEnd = () => {
    if (!toTime || toMinutes <= fromMin) setToTime(hhmm(Math.min(fromMin + 60, 23 * 60 + 59)));
    setOffStep('to');
  };

  async function pick(c: Client) {
    typed.current = true;
    setLinked(c); setName(c.name);
    const last = await repo.lastServiceId(c.id);
    if (last) setServiceId(last);
    go(1);
  }

  // A tap on the dimmed strip while she is typing only hides the keyboard; it never throws the booking away.
  function onBackdrop() {
    const el = input.current;
    if (el && (name.length > 0 || (typed.current && document.activeElement === el))) { el.blur(); return; }
    closeSheet();
  }

  async function save(confirmed = false) {
    if ((off ? !offValid : !canSave) || busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const offMinutes = toMinutes - fromMin;
      if (!confirmed) {
        // something already there: a pop-up says what (who, which service, from when to when) and asks, instead of a second press
        const hits = await repo.overlapsFor({ start, kind, serviceId: kind === 'client' ? sid : null, minutes: off ? offMinutes : kind === 'personal' ? chosen?.minutes ?? 30 : undefined });
        if (hits.length) { confirmOverlap(hits, () => void save(true)); return; }
      }
      const a = await repo.createAppointment(kind === 'client' ? { kind, name, serviceId: sid, start }
        : off ? { kind: 'personal', title: t('off.title'), minutes: offMinutes, start }
        : kind === 'personal' ? { kind, title: chosen!.name, optionId: chosen!.id, minutes: chosen!.minutes ?? 30, start }
        : { kind, title: chosen!.name, optionId: chosen!.id, amountCents: cents!, start });
      if (prefill.replaceId) await repo.deleteAppointment(prefill.replaceId); // booked in place of a cancelled visit
      ui.set({ sheet: null, date: datePart(a.start), ...(prefill.from?.type === 'client' ? { client: null, tab: 'calendar' as const, view: 'day' as const } : prefill.from ? { tab: 'calendar' as const } : {}) });
      highlight(a.id);
    } catch (e) {
      console.error(e);
    } finally {
      busy.current = false; setSaving(false);
    }
  }

  const title = screen === 0 ? t('sheet.new.title') : screen === 1 ? t('field.service') : off ? (offStep === 'to' ? t('off.to') : t('off.from')) : t('field.time');
  const pane = (i: Screen) => ({ 'data-active': screen === i ? '' : undefined, 'aria-hidden': screen !== i, style: { '--i': i } as CSSProperties });

  return (
    <Sheet variant="full" title={title} onClose={origin ? leave : closeSheet} onBackdrop={onBackdrop}
      left={screen === 0
        ? <button data-testid="btn-dismiss" onClick={closeSheet}>{t('btn.dismiss')}</button>
        : <button class="back" data-testid="btn-back" onClick={back}>‹ {t('nav.back')}</button>}
      >
      <div class={kb > 0 ? 'flow kb-open' : 'flow'} style={{ '--screen': screen, '--kb': `${kb}px` } as CSSProperties}>
        {/* 0 Klientas / Asmeninis / Išlaida */}
        <section class="flow-pane" ref={pane0} {...pane(0)} onTouchStart={(e) => { touchY.current = e.touches[0]!.clientY; }} onTouchMove={dismissOnDrag}>
          <LiquidSeg wide items={(['client', 'personal', 'expense'] as const).map((k) => ({ id: k, label: t(`type.${k}`) }))} value={kind} itemTestId={(k) => `type-${k}`}
            onChange={chooseKind} />
          <div key={kind} class={slide ? `kind-body slide-in-${slide}` : 'kind-body'}>
            {kind === 'client' && (
              <input ref={input} class="field" data-testid="field-name" value={name} autocomplete="off" autocapitalize="words" enterkeyhint="next" placeholder={t('field.name')}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } }}
                onInput={(e) => { typed.current = true; setName((e.target as HTMLInputElement).value); setLinked(null); }} />
            )}
            {kind !== 'client' && (
              <>
                <div class="opt-grid" data-testid="option-list" role="group">
                  {options.length === 0 && <p class="opt-none" data-testid="option-none">{t('option.none')}</p>}
                  {options.map((o, i) => {
                    const g = glyphFor(o.name);
                    return (
                      <button key={o.id} data-testid={`option-${i}`} class={o.id === optionId ? 'opt-card on' : 'opt-card'} aria-pressed={o.id === optionId}
                        style={{ '--g': `var(--c-${g.color})` } as CSSProperties} onClick={() => { if (o.id !== optionId) setAmountText(kind === 'expense' && o.costCents != null ? formatAmountInput(o.costCents) : ''); setOptionId(o.id); setOff(false); }}>
                        <span class="opt-ico" aria-hidden="true">{g.glyph}</span>
                        <span class="opt-name">{o.name}</span>
                        <span class="radio" aria-hidden="true"><CheckIcon /></span>
                      </button>
                    );
                  })}
                  {kind === 'personal' && (
                    <button data-testid="option-off" class={off ? 'opt-card off on' : 'opt-card off'} aria-pressed={off} onClick={() => { setOff(true); setOffStep('from'); setOptionId(null); }}>
                      <span class="opt-ico" aria-hidden="true">🌴</span>
                      <span class="off-text"><span class="opt-name">{t('off.title')}</span><span class="off-sub">{t('off.sub')}</span></span>
                      <span class="radio" aria-hidden="true"><CheckIcon /></span>
                    </button>
                  )}
                </div>
                {kind === 'expense' && (
                  <div ref={amountBlock}>
                  <label class="amount-field">
                    <input data-testid="expense-amount" inputMode="decimal" enterKeyHint="done" autocomplete="off" aria-label={t('expense.amount')} placeholder="0" value={amountText}
                      onInput={(e) => { setAmountText((e.target as HTMLInputElement).value); }} onFocus={() => setAmountFocus(true)} onBlur={() => setAmountFocus(false)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
                    <span class="amount-eur" aria-hidden="true">{euroSign}</span>
                  </label>
                  {usual !== null && (
                    <p class="amount-hint" data-testid="amount-hint">
                      {cents === usual || cents === null ? <><i>{t('cost.usual')}</i>{formatEuroShort(usual)}. {t('cost.hint')}</> : <><i class="chg">{t('cost.changed', { suma: formatEuroShort(usual) })}</i></>}
                    </p>
                  )}
                  </div>
                )}
              </>
            )}
            {kind === 'client' && (
              <ul class="suggest">
                {!name.trim() && matches.length > 0 && <li class="suggest-head">{t('suggest.recent')}</li>}
                {matches.filter((s) => s.client.id !== linked?.id).slice(0, MAX_SUGGESTIONS).map((s, i) => (
                  <li key={s.client.id}>
                    <button class="suggest-row" data-testid={`suggest-${i}`} onClick={() => void pick(s.client)}>
                      <span class="avatar" aria-hidden="true">{initials(s.client.name)}</span>
                      <span class="client-text">
                        <b><Marked name={s.client.name} query={name} /></b>
                        <span class="suggest-line">{suggestLine(s)}</span>
                      </span>
                      {s.waiting && <span class="mini-pill due" data-testid={`suggest-waiting-${i}`}>{t('client.pending')}</span>}
                      <span class="chev"><NextIcon /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 1 Paslauga */}
        <section class="flow-pane" {...pane(1)}>
          <p class="flow-who" data-testid="flow-who">{cleanName(name)}</p>
          <div class="opt-grid" role="group">
            {services.map((s, i) => (
              <button key={s.id} data-testid={`svc-${i}`} class={sid === s.id ? 'opt-card on' : 'opt-card'} aria-pressed={sid === s.id}
                style={{ '--g': `var(--c-${s.color})` } as CSSProperties} onClick={() => touch(setServiceId)(s.id)}>
                <span class="opt-ico" aria-hidden="true">{serviceGlyph(s.name)}</span>
                <span class="opt-name">{s.name}{s.floral ? ' 🌸' : ''}</span>
                <span class="radio" aria-hidden="true"><CheckIcon /></span>
              </button>
            ))}
          </div>
          <button class="time-row" data-testid="time-row" onClick={() => go(2)}>
            <span class="label">{t('field.time')}</span>
            <span class="value" data-testid="time-value">{formatWhen(start)}</span>
            <span class="chev" aria-hidden="true">›</span>
          </button>
        </section>

        {/* 2 Laikas */}
        <section class="flow-pane time-pane" {...pane(2)}>
          {off && (
            <div class="off-range" data-testid="off-range">
              <span class={offStep === 'from' ? 'off-chip on' : 'off-chip'} data-testid="off-chip-from"><i>{t('off.fromLabel')}</i><b data-testid="off-from-value">{start.slice(11, 16)}</b></span>
              <span class="off-arrow" aria-hidden="true">→</span>
              <span class={offStep === 'to' ? 'off-chip on' : 'off-chip'} data-testid="off-chip-to"><i>{t('off.toLabel')}</i><b data-testid="off-to-value">{toTime || '··:··'}</b></span>
            </div>
          )}
          {off && offStep === 'to'
            ? <DateTimePicker value={`${datePart(start)}T${toTime || start.slice(11, 16)}`} onChange={(v) => touch(setToTime)(v.slice(11, 16))} lockDate />
            : <DateTimePicker value={start} onChange={touch(setStart)} />}
          {off && offStep === 'to' && toTime && toMinutes <= fromMin && <p class="warn" role="alert" data-testid="off-invalid">{t('hours.invalid')}</p>}
        </section>

        {/* The main button: always at the bottom of the flow, riding up above the keyboard while it is open. */}
        <div class={kb > 0 ? 'flow-bar kb-open' : 'flow-bar'}>
          {screen === 0 && <button class="primary" data-testid="btn-next" disabled={!canNext} onClick={next}>{usual !== null && cents === usual ? t('cost.confirm', { suma: formatEuroShort(usual) }) : t('btn.next')}</button>}
          {screen === 1 && <button class="primary" data-testid="btn-save" disabled={!canSave || saving} onClick={() => void save()}>{t('btn.save')}</button>}
          {screen === 2 && !off && <button class="primary" data-testid="btn-save-time" disabled={!canSave || saving} onClick={() => void save()}>{t('btn.save')}</button>}
          {screen === 2 && off && offStep === 'from' && <button class="primary" data-testid="btn-off-next" onClick={toEnd}>{t('btn.next')}</button>}
          {screen === 2 && off && offStep === 'to' && <button class="primary" data-testid="btn-save-off" disabled={!offValid || saving} onClick={() => void save()}>{t('btn.save')}</button>}
        </div>
      </div>
    </Sheet>
  );
}

/** The name with the part she has typed picked out. (Folding keeps one character per character, so the positions line up.) */
function Marked({ name, query }: { name: string; query: string }) {
  const key = foldName(query), at = key ? foldName(name).indexOf(key) : -1;
  if (at < 0) return <>{name}</>;
  return <>{name.slice(0, at)}<mark>{name.slice(at, at + key.length)}</mark>{name.slice(at + key.length)}</>;
}
/** "Kitas: spalio 20 d. · Kirpimas" / "Buvo prieš 3 sav. · Dažymas" / "Vizitų dar nebuvo". */
function suggestLine(s: ClientSuggestion): string {
  const base = s.nextVisit ? t('cl.nextShort', { kada: formatDayShort(s.nextVisit) }) : agoText(s.lastVisit, nowLocal());
  return s.lastService && s.visitCount > 0 ? `${base} · ${s.lastService}` : base;
}
