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
