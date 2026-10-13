export type ServiceColor = 'blue'|'green'|'indigo'|'orange'|'pink'|'purple'|'red'|'teal'|'yellow'|'gray';
export type CancelReason = 'client' | 'ill' | 'other';
export interface Client { id: string; name: string; nameKey: string; phone?: string; createdAt: string; updatedAt: string }
export interface Move { at: string; from: string; to: string }
export interface Appointment {
  id: string; kind: 'client' | 'personal'; clientId: string | null; title: string | null; serviceId: string | null;
  start: string; status: 'booked' | 'cancelled' | 'noshow'; cancelReason: CancelReason | null; cancelledAt: string | null;
  moves: Move[]; createdAt: string; updatedAt: string;
}
export interface Service { id: string; name: string; color: ServiceColor; minutes: number; order: number; active: boolean }
export interface Settings { id: 'settings'; dayStart: string; dayEnd: string; slotMinutes: number; lastBackupAt: string | null; persistGranted: boolean | null }
export const SERVICE_COLORS: ServiceColor[] = ['blue', 'green', 'indigo', 'orange', 'pink', 'purple', 'red', 'teal', 'yellow', 'gray'];
