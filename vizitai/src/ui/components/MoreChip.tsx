import type { CSSProperties } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Entry } from '../../db/repo';
import { bindEntryDrag } from '../drag';

/**
 * The "+N" lane that gathers what does not fit side by side. Tap opens the list; press and hold lifts the first of the
 * hidden entries as a card of its own, to be dropped anywhere (the chip's count goes down while it is in her hand).
 */
export function MoreChip({ chipKey, testId, style, label, ariaLabel, first, hidden, onOpen }: {
  chipKey: string; testId: string; style: CSSProperties; label: string; ariaLabel: string; first: Entry;
  /** all the hidden count is already taken by the lifted entry: keep the element (it holds the gesture) but do not show it */
  hidden: boolean; onOpen: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef(first);
  latest.current = first;
  useEffect(() => (ref.current ? bindEntryDrag(ref.current, () => latest.current, chipKey) : undefined), []);
  return (
    <button ref={ref} class={hidden ? 'entry-more gone' : 'entry-more'} data-testid={testId} data-entry-box={hidden ? undefined : ''} data-chip-key={chipKey}
      aria-label={ariaLabel} style={style} onClick={onOpen}>
      {label}
    </button>
  );
}
