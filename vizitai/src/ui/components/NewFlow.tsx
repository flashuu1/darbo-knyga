import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import type { Client } from '../../db/types';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { cleanName } from '../../logic/names';
import { datePart } from '../../logic/time';
import { closeSheet, highlight } from '../actions';
import { useLive, useServices } from '../hooks';
import { ui } from '../store';
import { DateTimePicker } from './DateTimePicker';
import { Sheet } from './Sheet';

// Enough to find someone as the client list grows, few enough to stay clear of the keyboard.
const MAX_SUGGESTIONS = 5;
type Screen = 0 | 1 | 2; // 0 = client, 1 = service, 2 = time

/**
 * New booking as three screens inside one full-height modal:
 *   0 Klientas (name + recents, keyboard)  ->  1 Paslauga (service cards)  ->  2 Laikas (calendar + times)
 * Nothing resizes when the keyboard opens: the name field is at the top and only screen 0 has a keyboard.
 */
export function NewFlow({ prefill }: { prefill: { start: string; clientId?: string; serviceId?: string; screen?: 'time' } }) {
  const services = useServices(true);
  const [screen, setScreen] = useState<Screen>(prefill.screen === 'time' ? 2 : 0);
  const [kind, setKind] = useState<'client' | 'personal'>('client');
  const [name, setName] = useState('');
  const [linked, setLinked] = useState<Client | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(prefill.serviceId ?? null);
  const [start, setStart] = useState(prefill.start);
  const [clash, setClash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const typed = useRef(false); // she has typed in or picked into the name field
  const matches = useLive(() => repo.searchClients(name), [name], [] as Client[]);
  // A prefilled/last service may since have been hidden: fall back to the first card.
  const sid = services.some((s) => s.id === serviceId) ? serviceId : services[0]?.id ?? null;
  const hasName = cleanName(name).length > 0;
  const canSave = hasName && (kind === 'personal' || sid !== null);

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

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setClash(null); };
  const go = (s: Screen) => { if (s !== 0) input.current?.blur(); setScreen(s); };
  const next = () => { if (hasName) go(kind === 'client' ? 1 : 2); };
  const back = () => go(screen === 2 ? (kind === 'client' ? 1 : 0) : 0);

  async function pick(c: Client) {
    typed.current = true;
    setLinked(c); setName(c.name); setClash(null);
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

  async function save() {
    if (!canSave || busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const hit = await repo.findOverlapFor({ start, kind, serviceId: kind === 'client' ? sid : null });
      if (hit && clash === null) { setClash(t('warn.overlap', { vardas: hit.label, paslauga: hit.serviceName })); return; }
      const a = await repo.createAppointment(kind === 'client'
        ? { kind, name, serviceId: sid, start } : { kind, title: name, start });
      ui.set({ sheet: null, date: datePart(a.start) });
      highlight(a.id);
    } catch (e) {
      console.error(e);
    } finally {
      busy.current = false; setSaving(false);
    }
  }

  const title = screen === 0 ? t('sheet.new.title') : screen === 1 ? t('field.service') : t('field.time');
  const warn = clash && <p class="warn" role="alert" data-testid="overlap-warning">{clash}</p>;
  const pane = (i: Screen) => ({ 'data-active': screen === i ? '' : undefined, 'aria-hidden': screen !== i, style: { '--i': i } as CSSProperties });

  return (
    <Sheet variant="full" title={title} onClose={closeSheet} onBackdrop={onBackdrop}
      left={screen === 0
        ? <button data-testid="btn-dismiss" onClick={closeSheet}>{t('btn.dismiss')}</button>
        : <button class="back" data-testid="btn-back" onClick={back}>‹ {t('nav.back')}</button>}
      right={screen === 0
        ? <button class="strong" data-testid="btn-next" disabled={!hasName} onClick={next}>{t('btn.next')}</button>
        : screen === 2
          ? <button class="strong" data-testid="btn-save-time" disabled={!canSave || saving} onClick={() => void save()}>{t('btn.save')}</button>
          : undefined}>
      <div class="flow" style={{ '--screen': screen } as CSSProperties}>
        {/* 0 Klientas */}
        <section class="flow-pane" {...pane(0)}>
          <div class="segmented wide">
            {(['client', 'personal'] as const).map((k) => (
              <button key={k} data-testid={`type-${k}`} class={kind === k ? 'seg on' : 'seg'}
                onClick={() => { setKind(k); setLinked(null); setClash(null); }}>{t(`type.${k}`)}</button>
            ))}
          </div>
          <input ref={input} class="field" data-testid="field-name" value={name} autocomplete="off" autocapitalize="words" enterkeyhint="next"
            placeholder={kind === 'client' ? t('field.name') : t('field.title')}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } }}
            onInput={(e) => { typed.current = true; setName((e.target as HTMLInputElement).value); setLinked(null); setClash(null); }} />
          {kind === 'client' && (
            <ul class="suggest">
              {!name.trim() && matches.length > 0 && <li class="suggest-head">{t('suggest.recent')}</li>}
              {matches.filter((c) => c.id !== linked?.id).slice(0, MAX_SUGGESTIONS).map((c, i) => (
                <li key={c.id}><button data-testid={`suggest-${i}`} onClick={() => void pick(c)}><span>{c.name}</span><span class="chev" aria-hidden="true">›</span></button></li>
              ))}
            </ul>
          )}
        </section>

        {/* 1 Paslauga */}
        <section class="flow-pane" {...pane(1)}>
          <p class="flow-who" data-testid="flow-who">{cleanName(name)}</p>
          <div class="svc-cards">
            {services.map((s, i) => (
              <button key={s.id} data-testid={`svc-${i}`} class={sid === s.id ? 'svc-card on' : 'svc-card'} style={{ '--svc': `var(--c-${s.color})` } as CSSProperties}
                onClick={() => touch(setServiceId)(s.id)}>
                <span class="svc-name">{s.name}</span>
                <span class="svc-check" aria-hidden="true">✓</span>
              </button>
            ))}
          </div>
          <button class="time-row" data-testid="time-row" onClick={() => go(2)}>
            <span class="label">{t('field.time')}</span>
            <span class="value" data-testid="time-value">{formatWhen(start)}</span>
            <span class="chev" aria-hidden="true">›</span>
          </button>
          {screen !== 2 && warn}
          <button class="primary" data-testid="btn-save" disabled={!canSave || saving} onClick={() => void save()}>{t('btn.save')}</button>
        </section>

        {/* 2 Laikas */}
        <section class="flow-pane time-pane" {...pane(2)}>
          <DateTimePicker value={start} onChange={touch(setStart)} />
          {screen === 2 && warn}
        </section>
      </div>
    </Sheet>
  );
}
