import { t } from '../../i18n/lt';
import { ui, useStore } from '../store';

export function ToastHost() {
  const { toast } = useStore(ui);
  if (!toast) return null;
  return (
    <div class="toast" data-testid="toast" key={toast.id}>
      <span>{toast.text}</span>
      {toast.undo && (
        <button data-testid="toast-undo" onClick={() => { const u = toast.undo!; ui.set({ toast: null }); u().catch((e) => console.error(e)); }}>{t('toast.undo')}</button>
      )}
    </div>
  );
}
