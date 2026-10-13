import type { Transaction } from 'dexie';

export interface SchemaVersion {
  version: number;
  stores: Record<string, string | null>;
  upgrade?: (tx: Transaction) => void | PromiseLike<unknown>;
}
// Append new versions; never remove a store (Dexie keeps unspecified stores).
// A future v2 must also migrate older-schema backup files in parseBackup/importData (logic/backup.ts).
export const versions: SchemaVersion[] = [
  {
    version: 1,
    stores: {
      clients: 'id, nameKey',
      appointments: 'id, clientId, start, status',
      services: 'id, order',
      settings: 'id',
    },
  },
];
export const SCHEMA_VERSION = versions[versions.length - 1].version;
