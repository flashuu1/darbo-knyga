import type { Appointment } from '../db/types';
import { t } from '../i18n/lt';
import { isValidCents } from '../logic/amount';
import { nowLocal } from '../logic/time';

export type StatusKind = 'waiting' | 'unconfirmed' | 'done' | 'cancelled' | 'noshow';

/**
 * Where a visit stands: still ahead (waiting), time has passed but no amount yet (unconfirmed), or confirmed
 * with an amount (done). Cancelled and no-show are explicit.
 */
export function statusKind(a: Pick<Appointment, 'kind' | 'status' | 'start' | 'amountCents'>, now: string = nowLocal()): StatusKind {
  if (a.status === 'cancelled') return 'cancelled';
  if (a.status === 'noshow') return 'noshow';
  if (a.start > now) return 'waiting';
  return a.kind === 'personal' || isValidCents(a.amountCents) ? 'done' : 'unconfirmed';
}

const KEY = { waiting: 'status.waiting', unconfirmed: 'status.unconfirmed', done: 'status.done', cancelled: 'status.cancelled', noshow: 'status.noshow' } as const;
export const statusLabel = (a: Parameters<typeof statusKind>[0], now: string = nowLocal()): string => t(KEY[statusKind(a, now)]);
