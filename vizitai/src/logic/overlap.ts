import type { Appointment, Service } from '../db/types';
import { addMinutes, format, minutesOfDay, parse, snap } from './time';

export const PERSONAL_MINUTES = 15;
export interface Block { id: string; start: string; minutes: number }

export function minutesFor(a: Appointment, services: Map<string, Service>): number {
  if (a.kind === 'personal' || !a.serviceId) return PERSONAL_MINUTES;
  return services.get(a.serviceId)?.minutes ?? PERSONAL_MINUTES;
}
export function blocksOverlap(a: Block, b: Block): boolean {
  const as = parse(a.start), bs = parse(b.start);
  return as < bs + b.minutes && bs < as + a.minutes;
}
export function findOverlap(candidate: Block, booked: Appointment[], services: Map<string, Service>): Appointment | undefined {
  return booked.find(
    (a) => a.id !== candidate.id && a.status === 'booked' &&
      blocksOverlap(candidate, { id: a.id, start: a.start, minutes: minutesFor(a, services) }),
  );
}
export function nextFreeSlot(from: string, blocks: Block[], dayEndMin: number, slot = 15): string {
  let s = snap(from, slot, 'ceil');
  for (let i = 0; i < 200; i++) {
    const hit = blocks.find((b) => blocksOverlap({ id: '', start: s, minutes: slot }, b));
    if (!hit || minutesOfDay(s) >= dayEndMin) return s;
    s = snap(addMinutes(hit.start, hit.minutes), slot, 'ceil');
  }
  return format(parse(s));
}
