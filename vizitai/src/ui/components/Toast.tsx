import { t } from '../../i18n/lt';
import { saveFailed } from '../failure';
import { ui, useStore } from '../store';

export function ToastHost() {
  const { toast } = useStore(ui);
  if (!toast) return null;
  return (
    <div class={toast.error ? 'toast error' : 'toast'} data-testid="toast" key={toast.id} role={toast.error ? 'alert' : undefined}>
      <span>{toast.text}</span>
      {toast.retry && <button data-testid="toast-retry" onClick={toast.retry}>{t('fail.retry')}</button>}
      {toast.undo && (
        <button data-testid="toast-undo" onClick={() => { const u = toast.undo!; ui.set({ toast: null }); u().catch((e) => saveFailed(e, u)); }}>{t('toast.undo')}</button>
      )}
    </div>
  );
}
