import { repo } from '../db/repo';
import type { CancelReason } from '../db/types';
import { formatDayShort, weekdayShort } from '../i18n/format';
import { t } from '../i18n/lt';
import { datePart, timePart } from '../logic/time';
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

export async function moveWithToast(id: string, to: string) {
  const { before, after } = await repo.moveAppointment(id, to);
  if (before.start === after.start) return;
  const hit = await repo.findOverlapFor({ start: after.start, kind: after.kind, serviceId: after.serviceId, excludeId: id });
  let text = t('toast.moved', { data: `${formatDayShort(datePart(after.start))}, ${weekdayShort(after.start)}`, laikas: timePart(after.start) });
  if (hit) text += ` — ${t('warn.overlap', { vardas: hit.label, paslauga: hit.serviceName })}`;
  showToast(text, () => repo.putSnapshot(before));
}
export async function cancelWithToast(id: string, reason: CancelReason | null) {
  const { before } = await repo.cancelAppointment(id, reason);
  showToast(t('toast.cancelled'), () => repo.putSnapshot(before));
}
export async function noShowWithToast(id: string) {
  const { before } = await repo.markNoShow(id);
  showToast(t('toast.noshow'), () => repo.putSnapshot(before));
}
export async function restoreWithToast(id: string) {
  const { before } = await repo.restoreAppointment(id);
  showToast(t('toast.restored'), () => repo.putSnapshot(before));
}
export function confirmCancel(id: string) {
  const reasons: [CancelReason | null, 'cancel.reason.client' | 'cancel.reason.ill' | 'cancel.reason.other' | 'cancel.reason.none'][] = [
    ['client', 'cancel.reason.client'], ['ill', 'cancel.reason.ill'], ['other', 'cancel.reason.other'], [null, 'cancel.reason.none'],
  ];
  ui.set({
    action: {
      title: t('cancel.question'),
      items: [
        ...reasons.map(([r, key]) => ({ label: t(key), onPress: () => void cancelWithToast(id, r) })),
        { label: t('cancel.keep'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}
