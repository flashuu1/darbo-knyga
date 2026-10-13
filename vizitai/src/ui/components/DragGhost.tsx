import type { CSSProperties } from 'preact';
import { formatWhen } from '../../i18n/format';
import { ui, useStore } from '../store';

export function DragGhost() {
  const { drag } = useStore(ui);
  if (!drag) return null;
  return (
    <div class="drag-ghost" data-testid="drag-ghost" style={{ left: 0, top: 0, width: `${drag.width}px`, transform: `translate3d(${drag.x - drag.grabDX}px, ${drag.y - drag.grabDY}px, 0) scale(1.04)`, '--svc': `var(--c-${drag.entry.color})` } as CSSProperties}>
      <b>{drag.entry.label}</b>
      <span>{formatWhen(drag.label)}</span>
    </div>
  );
}
