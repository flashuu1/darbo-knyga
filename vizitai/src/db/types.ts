export type ServiceColor = 'blue'|'green'|'indigo'|'orange'|'pink'|'purple'|'red'|'teal'|'yellow'|'gray';
export type CancelReason = 'client' | 'ill' | 'other';
export interface Client { id: string; name: string; nameKey: string; phone?: string; createdAt: string; updatedAt: string }
export interface Move { at: string; from: string; to: string }
export interface Appointment {
  id: string; kind: 'client' | 'personal' | 'expense'; clientId: string | null; title: string | null; serviceId: string | null;
  start: string; status: 'booked' | 'cancelled' | 'noshow'; cancelReason: CancelReason | null; cancelledAt: string | null;
  moves: Move[]; createdAt: string; updatedAt: string;
  /** What she took for the visit, in integer euro cents. Absent or null = not entered yet. Unindexed: no schema bump. */
  amountCents?: number | null;
  /** Personal and expense entries: which of her own choices (Settings) it was picked from. Unindexed. */
  optionId?: string | null;
  /** Every time a confirmed amount was changed (or nulled, `to: null`): when, from what, to what. Unindexed. */
  amountLog?: { at: string; from: number; to: number | null }[];
  /** Personal entries: their length in minutes (the choice's length when it was made). Absent = 30. */
  durationMinutes?: number | null;
}
/** One of her own choices in Settings: what a personal entry can be, or what a kind of expense is. */
export type OptionGroup = 'personal' | 'expense';
export interface Option { id: string; group: OptionGroup; name: string; order: number; /** Personal choices: how long the entry is (default 30). */ minutes?: number }
/** `floral`: visits of this service get flowers while they are coming up or waiting for their payment (Vestuvės). Unindexed. */
export interface Service { id: string; name: string; color: ServiceColor; minutes: number; order: number; active: boolean; floral?: boolean }
export interface Settings { id: 'settings'; dayStart: string; dayEnd: string; slotMinutes: number; lastBackupAt: string | null; persistGranted: boolean | null }
export const SERVICE_COLORS: ServiceColor[] = ['blue', 'green', 'indigo', 'orange', 'pink', 'purple', 'red', 'teal', 'yellow', 'gray'];
