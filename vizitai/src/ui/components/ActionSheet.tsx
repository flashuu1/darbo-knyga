import { usePresence } from '../presence';
import { ui, useStore, type UiState } from '../store';

export function ActionSheet() {
  const { action } = useStore(ui);
  const [shown, leaving] = usePresence<NonNullable<UiState['action']>>(action);
  if (!shown) return null;
  const close = () => ui.set({ action: null });
  const main = shown.items.filter((i) => i.role !== 'cancel');
  const cancel = shown.items.find((i) => i.role === 'cancel');
  const press = (fn: () => void) => () => { close(); fn(); };
  return (
    <div class="layer action-layer" data-leaving={leaving ? '' : undefined}>
      <div class="backdrop" onClick={close} />
      <div class="actions">
        <div class="action-group">
          {shown.title && <p class="action-title" data-testid="action-title">{shown.title}</p>}
          {main.map((i, n) => (
            <button key={n} data-testid={`action-item-${n}`} class={i.role === 'destructive' ? 'action destructive' : 'action'} onClick={press(i.onPress)}>{i.label}</button>
          ))}
        </div>
        {cancel && <button data-testid={`action-item-${main.length}`} class="action cancel" onClick={press(cancel.onPress)}>{cancel.label}</button>}
      </div>
    </div>
  );
}
