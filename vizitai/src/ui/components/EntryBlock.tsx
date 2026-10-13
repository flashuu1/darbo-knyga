import type { CSSProperties } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Entry } from '../../db/repo';
import { t } from '../../i18n/lt';
import { timePart } from '../../logic/time';
import { openAppt } from '../actions';
import { bindEntryDrag } from '../drag';
import { ui, useStore } from '../store';

export function EntryBlock({ e, startMin, col, cols, compact, anchor }: { e: Entry; startMin: number; col: number; cols: number; compact: boolean; anchor?: boolean }) {
  const { highlight } = useStore(ui);
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef(e);
  latest.current = e;
  useEffect(() => (ref.current ? bindEntryDrag(ref.current, () => latest.current) : undefined), []);
  const mins = +e.appt.start.slice(11, 13) * 60 + +e.appt.start.slice(14, 16);
  const thin = e.appt.status === 'cancelled';
  const style = thin
    ? { top: `calc(var(--row) * ${(mins - startMin) / 15})` }
    : {
        top: `calc(var(--row) * ${(mins - startMin) / 15})`,
        height: `calc(var(--row) * ${e.minutes / 15})`,
        left: `${(col / cols) * 100}%`,
        width: `${100 / cols}%`,
      };
  const cls = ['entry', thin ? 'thin' : '', e.appt.status === 'noshow' ? 'noshow' : '', highlight === e.appt.id ? 'highlight' : '', anchor ? 'anchor' : ''].join(' ');
  return (
    <button ref={ref} class={cls} style={{ ...style, '--svc': `var(--c-${e.color})` } as CSSProperties} data-testid={`entry-${e.appt.id}`} data-entry-id={e.appt.id}
      onClick={() => openAppt(e.appt.id)}>
      <span class="entry-time">{timePart(e.appt.start)}</span>
      <b class="entry-name">{e.label}</b>
      {!compact && e.service && <span class="entry-svc">{e.service.name}</span>}
      {e.appt.status === 'noshow' && <span class="entry-svc">{t('status.noshow')}</span>}
    </button>
  );
}
