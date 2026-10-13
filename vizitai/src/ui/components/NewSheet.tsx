import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import type { Client } from '../../db/types';
import { formatWhen } from '../../i18n/format';
import { t } from '../../i18n/lt';
import { cleanName } from '../../logic/names';
import { datePart, snap } from '../../logic/time';
import { closeSheet, highlight } from '../actions';
import { useLive, useServices } from '../hooks';
import { ui } from '../store';
import { Sheet } from './Sheet';

export function NewSheet({ prefill }: { prefill: { start: string; clientId?: string; serviceId?: string } }) {
  const services = useServices(true);
  const [kind, setKind] = useState<'client' | 'personal'>('client');
  const [name, setName] = useState('');
  const [linked, setLinked] = useState<Client | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(prefill.serviceId ?? null);
  const [start, setStart] = useState(prefill.start);
  const [clash, setClash] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const matches = useLive(() => repo.searchClients(name), [name], [] as Client[]);
  const sid = serviceId ?? services[0]?.id ?? null;
  const canSave = cleanName(name).length > 0;

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (prefill.clientId) void repo.getClient(prefill.clientId).then((c) => { if (c) void pick(c, !prefill.serviceId); });
  }, []);

  async function pick(c: Client, useLast = true) {
    setLinked(c); setName(c.name); setClash(null);
    if (useLast) { const last = await repo.lastServiceId(c.id); if (last) setServiceId(last); }
  }
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setClash(null); };

  async function save() {
    if (!canSave) return;
    const hit = await repo.findOverlapFor({ start, kind, serviceId: kind === 'client' ? sid : null });
    if (hit && clash === null) { setClash(t('warn.overlap', { vardas: hit.label, paslauga: hit.serviceName })); return; }
    const a = await repo.createAppointment(kind === 'client'
      ? { kind, name, serviceId: sid, start } : { kind, title: name, start });
    ui.set({ sheet: null, date: datePart(a.start) });
    highlight(a.id);
  }

  return (
    <Sheet title={t('sheet.new.title')} onClose={closeSheet}
      left={<button data-testid="btn-dismiss" onClick={closeSheet}>{t('btn.dismiss')}</button>}
      right={<button class="strong" data-testid="btn-save" disabled={!canSave} onClick={() => void save()}>{t('btn.save')}</button>}>
      <div class="segmented wide">
        {(['client', 'personal'] as const).map((k) => (
          <button key={k} data-testid={`type-${k}`} class={kind === k ? 'seg on' : 'seg'} onClick={() => { setKind(k); setLinked(null); setClash(null); }}>{t(`type.${k}`)}</button>
        ))}
      </div>
      <input ref={input} class="field" data-testid="field-name" value={name} autocomplete="off" autocapitalize="words"
        placeholder={kind === 'client' ? t('field.name') : t('field.title')}
        onInput={(e) => { setName((e.target as HTMLInputElement).value); setLinked(null); setClash(null); }} />
      {kind === 'client' && (
        <ul class="suggest">
          {!name.trim() && matches.length > 0 && <li class="suggest-head">{t('suggest.recent')}</li>}
          {matches.filter((c) => c.id !== linked?.id).map((c, i) => (
            <li key={c.id}><button data-testid={`suggest-${i}`} onClick={() => void pick(c)}>{c.name}</button></li>
          ))}
        </ul>
      )}
      {kind === 'client' && (
        <>
          <p class="label">{t('field.service')}</p>
          <div class="chips">
            {services.map((s, i) => (
              <button key={s.id} data-testid={`svc-${i}`} class={sid === s.id ? 'chip on' : 'chip'} style={{ '--svc': `var(--c-${s.color})` } as CSSProperties}
                onClick={() => touch(setServiceId)(s.id)}>{s.name}</button>
            ))}
          </div>
        </>
      )}
      <label class="row timerow">
        <span class="label">{t('field.time')}</span>
        <span class="value" data-testid="time-value">{formatWhen(start)}</span>
        <input type="datetime-local" step={900} value={start} data-testid="time-input"
          onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) touch(setStart)(snap(v)); }} />
      </label>
      {clash && <p class="warn" role="alert" data-testid="overlap-warning">{clash}</p>}
    </Sheet>
  );
}
