import { ui, useStore } from '../store';

export function ActionSheet() {
  const { action } = useStore(ui);
  if (!action) return null;
  const close = () => ui.set({ action: null });
  const main = action.items.filter((i) => i.role !== 'cancel');
  const cancel = action.items.find((i) => i.role === 'cancel');
  const press = (fn: () => void) => () => { close(); fn(); };
  return (
    <div class="sheet-root action-root">
      <div class="backdrop" onClick={close} />
      <div class="actions">
        <div class="action-group">
          {action.title && <p class="action-title" data-testid="action-title">{action.title}</p>}
          {main.map((i, n) => (
            <button key={n} data-testid={`action-item-${n}`} class={i.role === 'destructive' ? 'action destructive' : 'action'} onClick={press(i.onPress)}>{i.label}</button>
          ))}
        </div>
        {cancel && <button data-testid={`action-item-${main.length}`} class="action cancel" onClick={press(cancel.onPress)}>{cancel.label}</button>}
      </div>
    </div>
  );
}
