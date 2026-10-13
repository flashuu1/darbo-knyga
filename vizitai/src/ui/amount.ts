import { repo } from '../db/repo';
import type { Appointment } from '../db/types';
import { t } from '../i18n/lt';
import { isAmountDue } from '../logic/amount';
import { nowLocal } from '../logic/time';
import { closeSheet, openAppt, primeKeyboard, showToast } from './actions';
import { ui } from './store';

/** Opens the Suma sheet. Call synchronously from the tap so iOS raises the number keyboard (see primeKeyboard). */
export function openAmount(id: string) {
  primeKeyboard('decimal');
  ui.set({ sheet: { type: 'amount', id } });
}
/** A tap on a calendar entry: a visit waiting for its amount opens Suma, everything else the appointment sheet. */
export function openEntry(a: Appointment) {
  if (isAmountDue(a, nowLocal())) openAmount(a.id);
  else openAppt(a.id);
}
/** Saves (or clears, with null) the amount, closes the sheet and offers Anuliuoti. Throws if the write fails. */
export async function saveAmountWithToast(id: string, cents: number | null) {
  const { before } = await repo.setAmount(id, cents);
  const s = ui.get().sheet;
  if (s?.type === 'amount' && s.id === id) closeSheet();
  showToast(t(cents === null ? 'amount.cleared' : 'amount.saved'), () => repo.putSnapshot(before));
}
