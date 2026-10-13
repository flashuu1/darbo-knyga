import { describe, it, expect } from 'vitest';
import { findOverlap, nextFreeSlot, PERSONAL_MINUTES, minutesFor } from '../../src/logic/overlap';
import type { Appointment, Service } from '../../src/db/types';

const svc = (id: string, minutes: number): Service => ({ id, name: id, color: 'blue', minutes, order: 0, active: true });
const services = new Map([['cut', svc('cut', 60)], ['short', svc('short', 30)]]);
const appt = (id: string, start: string, o: Partial<Appointment> = {}): Appointment => ({
  id, kind: 'client', clientId: 'c', title: null, serviceId: 'cut', start, status: 'booked', cancelReason: null,
  cancelledAt: null, moves: [], createdAt: '', updatedAt: '', ...o,
});

describe('overlap', () => {
  const booked = [appt('a', '2026-10-14T10:00')];
  it('detects an intersecting start', () => {
    expect(findOverlap({ id: 'n', start: '2026-10-14T10:30', minutes: 30 }, booked, services)?.id).toBe('a');
  });
  it('treats the end of a block as free', () => {
    expect(findOverlap({ id: 'n', start: '2026-10-14T11:00', minutes: 30 }, booked, services)).toBeUndefined();
  });
  it('detects a candidate that ends inside an existing block', () => {
    expect(findOverlap({ id: 'n', start: '2026-10-14T09:30', minutes: 60 }, booked, services)?.id).toBe('a');
  });
  it('ignores cancelled and no-show entries', () => {
    const list = [appt('x', '2026-10-14T10:00', { status: 'cancelled' }), appt('y', '2026-10-14T10:00', { status: 'noshow' })];
    expect(findOverlap({ id: 'n', start: '2026-10-14T10:00', minutes: 30 }, list, services)).toBeUndefined();
  });
  it('ignores the appointment itself', () => {
    expect(findOverlap({ id: 'a', start: '2026-10-14T10:00', minutes: 60 }, booked, services)).toBeUndefined();
  });
  it('gives personal entries the default length', () => {
    const p = appt('p', '2026-10-14T12:00', { kind: 'personal', serviceId: null, clientId: null, title: 'Pietūs' });
    expect(minutesFor(p, services)).toBe(PERSONAL_MINUTES);
    expect(PERSONAL_MINUTES).toBe(15);
    expect(findOverlap({ id: 'n', start: '2026-10-14T11:45', minutes: 30 }, [p], services)?.id).toBe('p');
    expect(findOverlap({ id: 'n', start: '2026-10-14T12:15', minutes: 15 }, [p], services)).toBeUndefined();
  });
  it('finds the next free slot after now', () => {
    const blocks = [{ id: 'a', start: '2026-10-14T10:00', minutes: 60 }];
    expect(nextFreeSlot('2026-10-14T09:05', blocks, 20 * 60)).toBe('2026-10-14T09:15');
    expect(nextFreeSlot('2026-10-14T10:05', blocks, 20 * 60)).toBe('2026-10-14T11:00');
  });
});
