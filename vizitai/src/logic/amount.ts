import type { Appointment } from '../db/types';

/** Sane upper bound for one visit: 100 000 €. */
export const MAX_AMOUNT_CENTS = 100_000 * 100;

/** A storable amount: whole cents, 0 … MAX_AMOUNT_CENTS. */
export const isValidCents = (c: unknown): c is number =>
  typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= MAX_AMOUNT_CENTS;

/** True when an amount has been entered for the visit (0 € counts as entered). */
export const hasAmount = (a: Pick<Appointment, 'amountCents'>): boolean => isValidCents(a.amountCents);

/**
 * A client visit whose start time has come (`start <= now`, both local wall-clock `YYYY-MM-DDTHH:mm`)
 * and that still waits for its amount. Cancelled, no-show and personal entries are never due.
 */
export function isAmountDue(a: Pick<Appointment, 'kind' | 'status' | 'start' | 'amountCents'>, now: string): boolean {
  return a.kind === 'client' && a.status === 'booked' && a.start <= now && !hasAmount(a);
}

/** Visits that may carry an amount (shown in the appointment sheet): past or current booked client visits. */
export function canHaveAmount(a: Pick<Appointment, 'kind' | 'status' | 'start'>, now: string): boolean {
  return a.kind === 'client' && a.status === 'booked' && a.start <= now;
}
