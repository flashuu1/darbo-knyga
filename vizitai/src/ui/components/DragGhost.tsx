import type { CSSProperties } from 'preact';
import { formatWhen } from '../../i18n/format';
import { ui, useStore } from '../store';

export function DragGhost() {
  const { drag } = useStore(ui);
  if (!drag) return null;
  return (
    <div class="drag-ghost" data-testid="drag-ghost" style={{ left: `${drag.left}px`, top: `${drag.y - drag.grabDY}px`, width: `${drag.width}px`, '--svc': `var(--c-${drag.entry.color})` } as CSSProperties}>
      <b>{drag.entry.label}</b>
      <span>{formatWhen(drag.label)}</span>
    </div>
  );
}
