import { db } from '../db/db';
import { repo, type Entry } from '../db/repo';
import type { CancelReason } from '../db/types';
import { formatDayShort, weekdayShort } from '../i18n/format';
import { t } from '../i18n/lt';
import { backupFileName, BackupError, exportData, importData, parseBackup, shareBackup, type BackupFile } from '../logic/backup';
import { addDays, datePart, timePart, todayStr } from '../logic/time';
import { ui } from './store';

let toastId = 0;
let toastTimer = 0;
export function showToast(text: string, undo?: () => Promise<void>) {
  clearTimeout(toastTimer);
  ui.set({ toast: { id: ++toastId, text, undo } });
  toastTimer = window.setTimeout(() => ui.set({ toast: null }), 5000);
}
// The toast floats above sheets, action sheets and the client card, where a stray tap on "Anuliuoti"
// would silently undo the previous action. So opening any of them dismisses it for good (no reappearing
// undo later). A toast raised while one is already open (e.g. cancelling from the client card) stays.
let layers: unknown[] = [null, null, null];
ui.subscribe(() => {
  const s = ui.get();
  const next = [s.sheet, s.action, s.client];
  const opened = next.some((v, i) => v !== null && v !== layers[i]);
  layers = next;
  if (opened && s.toast) { clearTimeout(toastTimer); ui.set({ toast: null }); }
});
export const KB_PRIMER_ID = 'kb-primer';
/**
 * iOS raises the keyboard only for a focus() made synchronously inside the tap handler, and keeps it
 * up when focus then moves to another input. Call this first thing in every handler that opens the
 * New sheet (before any await); the sheet moves focus to the name field once it has rendered.
 */
export function primeKeyboard() {
  document.getElementById(KB_PRIMER_ID)?.focus({ preventScroll: true });
}
export function openNew(start: string, extra: { clientId?: string; serviceId?: string } = {}) {
  primeKeyboard(); // slot and Kartoti taps call this synchronously from their tap handler
  ui.set({ sheet: { type: 'new', start, ...extra } });
}
export async function openNewToday() {
  primeKeyboard(); // before the await, while still inside the tap
  try {
    openNew(await repo.defaultStartFor(ui.get().date));
  } catch (e) {
    console.error(e);
    (document.activeElement as HTMLElement | null)?.blur();
  }
}
export const openAppt = (id: string) => ui.set({ sheet: { type: 'appt', id } });
/** The "+N" chip of a crowded time: an action sheet listing the entries it hides. */
export function showOverflow(list: Entry[]) {
  ui.set({
    action: {
      title: t('overflow.title'),
      items: [
        ...list.map((e) => ({
          label: t('overflow.item', { laikas: timePart(e.appt.start), vardas: e.label, paslauga: e.service?.name ?? t('type.personal') }),
          onPress: () => openAppt(e.appt.id),
        })),
        { label: t('btn.close'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}
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

let backingUp = false;
export async function runBackup() {
  if (backingUp) return;
  backingUp = true;
  try {
    const json = JSON.stringify(await exportData(db));
    const result = await shareBackup(json, backupFileName());
    if (result === 'cancelled') return; // share sheet dismissed: nothing was saved
    await repo.updateSettings({ lastBackupAt: new Date().toISOString() });
    showToast(t('backup.exported'));
  } catch (e) {
    console.error(e);
    showToast(t('backup.error.export'));
  } finally {
    backingUp = false;
  }
}
let importing = false;
async function doImport(file: BackupFile) {
  if (importing) return;
  importing = true;
  try {
    await importData(db, file);
    showToast(t('backup.imported'));
  } catch (e) {
    console.error(e);
    showToast(t('backup.error.format'));
  } finally {
    importing = false;
  }
}
export async function chooseImport(file: File) {
  let parsed: BackupFile;
  try { parsed = parseBackup(await file.text()); } catch (e) {
    showToast(t(e instanceof BackupError && e.code === 'newer' ? 'backup.error.newer' : 'backup.error.format'));
    return; // nothing was touched
  }
  ui.set({ action: { title: t('backup.confirm'), items: [
    { label: t('backup.replace'), role: 'destructive', onPress: () => void doImport(parsed) },
    { label: t('btn.dismiss'), role: 'cancel', onPress: () => {} },
  ] } });
}

/**
 * Užregistruoti į priekį: the same client and service, booked through the calendar picker. The flow opens
 * straight on its Laikas screen (no keyboard) with tomorrow at the visit's time of day preselected.
 */
export function rebook(e: { start: string; clientId: string | null; serviceId: string | null }) {
  const clientId = e.clientId;
  if (!clientId) return;
  const s = ui.get();
  // Like Registruoti: leave the client card / other tab for the calendar so the new entry is seen.
  const leave = s.client !== null || s.tab !== 'calendar' ? { client: null, tab: 'calendar' as const, view: 'day' as const } : {};
  ui.set({
    ...leave,
    sheet: { type: 'new', start: `${addDays(todayStr(), 1)}T${timePart(e.start)}`, clientId, serviceId: e.serviceId ?? undefined, screen: 'time' },
  });
}
