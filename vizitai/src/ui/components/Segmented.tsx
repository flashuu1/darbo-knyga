/**
 * A segmented control whose white thumb slides between the options (transform only). Used for Sąrašas / Analizė and
 * for the analysis tabs.
 */
export function Segmented<T extends string>({ items, value, onChange, testId, small }: {
  items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; testId: string; small?: boolean;
}) {
  const idx = Math.max(0, items.findIndex((i) => i.id === value));
  return (
    <div class={small ? 'pillseg small' : 'pillseg'} data-testid={testId} style={{ '--n': items.length, '--idx': idx }}>
      <i class="thumb" />
      {items.map((i) => (
        <button key={i.id} class={i.id === value ? 'on' : ''} data-testid={`${testId}-${i.id}`} onClick={() => onChange(i.id)}>{i.label}</button>
      ))}
    </div>
  );
}

/**
 * The calendar's Diena / Savaitė switch: a liquid-glass capsule with a glass drop that slides to the chosen side on a spring
 * (transform only). Same idea as the period pane on Analizė, sized for a navigation bar.
 */
export function LiquidSeg<T extends string>({ items, value, onChange, itemTestId, wide }: {
  items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; itemTestId: (id: T) => string;
  /** fills the width of its place and is a little taller (the Klientas / Asmeninis / Išlaida choice) */
  wide?: boolean;
}) {
  const idx = Math.max(0, items.findIndex((i) => i.id === value));
  return (
    <div class={wide ? 'lq lq-seg wide' : 'lq lq-seg'} role="group" style={{ '--n': items.length, '--idx': idx }}>
      <i class="lq-drop" />
      {items.map((i) => (
        <button key={i.id} class={i.id === value ? 'lq-opt on' : 'lq-opt'} data-testid={itemTestId(i.id)} aria-pressed={i.id === value} onClick={() => onChange(i.id)}>{i.label}</button>
      ))}
    </div>
  );
}
