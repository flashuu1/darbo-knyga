import { db } from '../db/db';
import { repo, type Entry, type OverlapInfo } from '../db/repo';
import type { Appointment, CancelReason, Option } from '../db/types';
import { formatDayShort, weekdayShort } from '../i18n/format';
import { t, type Key } from '../i18n/lt';
import { backups, type Snap } from '../db/backups';
import { backupFileName, BackupError, exportData, importData, parseBackup, shareBackup, type BackupFile } from '../logic/backup';
import { fingerprint } from '../logic/snapshots';
import { addDays, datePart, nowLocal, timePart, todayStr } from '../logic/time';
import { ui, type Origin, type Sheet } from './store';

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
export function primeKeyboard(mode: 'text' | 'decimal' = 'text') {
  const el = document.getElementById(KB_PRIMER_ID) as HTMLInputElement | null;
  if (!el) return;
  el.inputMode = mode; // 'decimal' raises the number pad straight away (the keyboard type is fixed when it opens)
  el.focus({ preventScroll: true });
}
export function openNew(start: string, extra: { clientId?: string; serviceId?: string; replaceId?: string } = {}) {
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
export const sheetKey = (s: Sheet) => (s.type === 'new' ? 'new' : s.type === 'summary' || s.type === 'cfilter' || s.type === 'cnew' ? s.type : `${s.type}${s.id}`);
export function closeSheet() {
  const { back, sheet } = ui.get();
  if (back && sheet && sheetKey(sheet) === back.for) ui.set({ sheet: back.sheet, back: null }); // e.g. Suma opened from the day summary
  else ui.set({ sheet: null, back: null });
}
/** The summary (the books) of the day, week or month on screen; a day is never in the future. */
export function openSummary(scope: 'day' | 'week' | 'month') {
  const d = ui.get().date;
  ui.set({ sheet: { type: 'summary', scope, date: scope === 'day' && d > todayStr() ? todayStr() : d } });
}
async function deleteCancelled(a: Appointment) {
  await repo.deleteAppointment(a.id);
  showToast(t('cancelled.deleted'), () => repo.putSnapshot(a));
}
/** Swipe-to-delete on a contact: confirm, then remove the client and their visits (undo restores both). */
export async function confirmDeleteClient(id: string, name: string) {
  const n = await repo.countVisits(id);
  ui.set({
    action: {
      title: n > 0 ? t('client.deleteQVisits', { vardas: name, n }) : t('client.deleteQ', { vardas: name }),
      items: [
        { label: t('btn.delete'), role: 'destructive' as const, onPress: () => void (async () => {
          const snap = await repo.deleteClient(id);
          if (snap) showToast(t('client.deleted'), () => repo.restoreClient(snap));
        })().catch((e) => console.error(e)) },
        { label: t('btn.keep'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}
/** Swipe-to-delete on a service in Nustatymai. */
export function confirmDeleteService(s: { id: string; name: string }) {
  ui.set({
    action: {
      title: t('service.deleteQ', { vardas: s.name }),
      items: [
        { label: t('btn.delete'), role: 'destructive' as const, onPress: () => void (async () => {
          try {
            const r = await repo.deleteService(s.id);
            if (r.result === 'hidden') showToast(t('service.hiddenInstead'), () => repo.restoreService(r.service));
            else showToast(t('service.deleted'), () => repo.restoreService(r.service));
          } catch { showToast(t('service.lastActive')); }
        })() },
        { label: t('btn.keep'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}
/** Removes an expense (it is not a visit, so there is nothing to cancel). Anuliuoti puts it back. */
export async function deleteExpenseWithToast(id: string) {
  const before = await repo.getAppointment(id);
  if (!before) return;
  await repo.deleteAppointment(id);
  showToast(t('expense.deleted'), () => repo.putSnapshot(before));
}
export function confirmDeleteOption(o: Option) {
  ui.set({
    action: {
      title: t('option.deleteQ', { vardas: o.name }),
      items: [
        { label: t('btn.delete'), role: 'destructive' as const, onPress: () => void (async () => {
          const gone = await repo.deleteOption(o.id);
          if (gone) showToast(t('option.deleted'), () => repo.restoreOption(gone));
        })() },
        { label: t('btn.keep'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}
/**
 * A tap on a cancelled entry (the thin struck-through line): bring it back as it was, or book something new in
 * its place (the cancelled entry is then removed). Both are one tap away; the rest of the row still books normally.
 */
export function openCancelled(e: Entry) {
  ui.set({
    action: {
      title: t('cancelled.title', { vardas: e.label, laikas: timePart(e.appt.start) }),
      items: [
        { label: t('cancelled.renew'), onPress: () => void restoreWithToast(e.appt.id) },
        { label: t('cancelled.replace'), onPress: () => openNew(e.appt.start, { replaceId: e.appt.id }) },
        { label: t('cancelled.delete'), role: 'destructive' as const, onPress: () => void deleteCancelled(e.appt) },
        { label: t('btn.close'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}
export function highlight(id: string) {
  ui.set({ highlight: id });
  window.setTimeout(() => ui.set({ highlight: null }), 1800);
}

/** Moved: the toast only says where it went (and offers Anuliuoti). Overlaps are asked about before a move by dialog, never after a drag. */
export async function moveWithToast(id: string, to: string) {
  const { before, after } = await repo.moveAppointment(id, to);
  if (before.start === after.start) return;
  const text = t('toast.moved', { data: `${formatDayShort(datePart(after.start))}, ${weekdayShort(after.start)}`, laikas: timePart(after.start) });
  showToast(text, () => repo.putSnapshot(before));
}
/** One line per entry in the way: "Ona · Kirpimas · 14:00–14:30". */
export const overlapLine = (o: OverlapInfo) => [o.label, o.what, `${timePart(o.start)}–${timePart(o.end)}`].filter(Boolean).join(' · ');
/**
 * "There is already something at that time": a pop-up that says what (who, which service, from when to when) and asks
 * whether to go ahead anyway. `go` runs only if she agrees; "Pakeisti laiką" leaves everything as it is.
 */
export function confirmOverlap(hits: OverlapInfo[], go: () => void, goLabel: Key = 'overlap.keep') {
  ui.set({
    action: {
      title: `${t('overlap.title')}\n${t('overlap.with')}`,
      lines: hits.map(overlapLine),
      items: [
        { label: t(goLabel), onPress: go },
        { label: t('overlap.change'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
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
/** "Atšaukti vizitą?": a plain confirmation, no reason to pick. */
export function confirmCancel(id: string) {
  ui.set({
    action: {
      title: t('cancel.question'),
      items: [
        { label: t('act.cancelAppt'), role: 'destructive' as const, onPress: () => void cancelWithToast(id, null) },
        { label: t('cancel.keep'), role: 'cancel' as const, onPress: () => {} },
      ],
    },
  });
}

const when = (iso: string) => `${formatDayShort(todayStr(new Date(iso)))}, ${nowLocal(new Date(iso)).slice(11, 16)}`;
let backingUp = false;
/**
 * Exports the books to Files (the share sheet). When nothing has changed since the last export it asks first (`again`), and
 * the export is kept in the app too (see db/backups.ts), but never twice for the same books.
 */
export async function runBackup(again = false) {
  if (backingUp) return;
  backingUp = true;
  try {
    const file = await exportData(db);
    const last = await backups.latest('export');
    if (!again && last && last.fp === fingerprint(file)) {
      ui.set({ action: { title: t('backup.unchanged', { kada: when(last.at) }), items: [
        { label: t('backup.again'), onPress: () => void runBackup(true) },
        { label: t('btn.dismiss'), role: 'cancel', onPress: () => {} },
      ] } });
      return;
    }
    const json = JSON.stringify(file);
    const result = await shareBackup(json, backupFileName());
    if (result === 'cancelled') return; // share sheet dismissed: nothing was saved
    await backups.save('export', file, json);
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
/** Replaces the books with `file`, after keeping the current ones as the safety copy, so the toast can undo it. */
async function doImport(file: BackupFile) {
  if (importing) return;
  importing = true;
  try {
    const current = await exportData(db);
    const { snap: safety } = await backups.save('safety', current, JSON.stringify(current));
    await importData(db, file);
    showToast(t('backup.imported'), async () => {
      const back = await backups.get(safety.id);
      if (back) await importData(db, parseBackup(back.json));
    });
  } catch (e) {
    console.error(e);
    showToast(t('backup.error.format'));
  } finally {
    importing = false;
  }
}
/** Asks, then restores `file`; says so instead when the books already are exactly that. */
async function confirmRestore(file: BackupFile, lines?: string[]) {
  if (fingerprint(file) === fingerprint(await exportData(db))) { showToast(t('backup.same')); return; }
  ui.set({ action: { title: t('backup.restoreQ'), ...(lines ? { lines } : {}), items: [
    { label: t('backup.restore'), role: 'destructive', onPress: () => void doImport(file) },
    { label: t('btn.dismiss'), role: 'cancel', onPress: () => {} },
  ] } });
}
/** Tapping a copy in the list: what it holds, and the question. */
export async function restoreSnapshot(s: Snap) {
  try {
    await confirmRestore(parseBackup(s.json), [when(s.at), t('backup.snapLine', { k: s.counts.clients, v: s.counts.visits, kb: Math.max(1, Math.round(s.bytes / 1024)) }), t('backup.restoreNote')]);
  } catch (e) { console.error(e); showToast(t('backup.error.format')); }
}
export async function chooseImport(file: File) {
  let parsed: BackupFile;
  try { parsed = parseBackup(await file.text()); } catch (e) {
    showToast(t(e instanceof BackupError && e.code === 'newer' ? 'backup.error.newer' : 'backup.error.format'));
    return; // nothing was touched
  }
  await confirmRestore(parsed, [t('backup.restoreNote')]);
}
/** The first time the app is in front each day: keeps a copy in the app if the books changed since the last copy of any kind. */
let autoChecked = '';
export async function autoSnapshot() {
  try {
    const today = todayStr();
    if (autoChecked === today || (await db.appointments.count()) === 0) return;
    autoChecked = today;
    const last = await backups.latest('auto');
    if (last && todayStr(new Date(last.at)) === today) return;
    const file = await exportData(db);
    await backups.save('auto', file, JSON.stringify(file));
  } catch (e) { console.error(e); }
}

/**
 * Užregistruoti į priekį: the same client and service, booked through the calendar picker. The flow opens
 * straight on its Laikas screen (no keyboard) with tomorrow at the visit's time of day preselected.
 */
export function rebook(e: { start: string; clientId: string | null; serviceId: string | null }, from: Origin) {
  const clientId = e.clientId;
  if (!clientId) return;
  // The appointment sheet / client card stays where it is: "Atgal" returns to it. Saving leaves the card for the calendar (NewFlow).
  ui.set({
    sheet: { type: 'new', start: `${addDays(todayStr(), 1)}T${timePart(e.start)}`, clientId, serviceId: e.serviceId ?? undefined, screen: 'time', from },
  });
}
