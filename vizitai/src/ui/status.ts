import type { Appointment } from '../db/types';
import { t } from '../i18n/lt';
import { nowLocal } from '../logic/time';

export function statusLabel(a: Appointment, now: string = nowLocal()): string {
  if (a.status === 'cancelled') return t('status.cancelled');
  if (a.status === 'noshow') return t('status.noshow');
  return a.start < now ? t('status.done') : t('status.booked');
}
