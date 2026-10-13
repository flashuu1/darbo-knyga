import { repo } from '../db/repo';
import { ui } from './store';

let toastId = 0;
let toastTimer = 0;
export function showToast(text: string, undo?: () => Promise<void>) {
  clearTimeout(toastTimer);
  ui.set({ toast: { id: ++toastId, text, undo } });
  toastTimer = window.setTimeout(() => ui.set({ toast: null }), 5000);
}
export function openNew(start: string, extra: { clientId?: string; serviceId?: string } = {}) {
  ui.set({ sheet: { type: 'new', start, ...extra } });
}
export async function openNewToday() {
  openNew(await repo.defaultStartFor(ui.get().date));
}
export const openAppt = (id: string) => ui.set({ sheet: { type: 'appt', id } });
export const closeSheet = () => ui.set({ sheet: null });
export function highlight(id: string) {
  ui.set({ highlight: id });
  window.setTimeout(() => ui.set({ highlight: null }), 1800);
}
