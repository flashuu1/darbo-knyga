import Dexie, { type Table } from 'dexie';
import type { Appointment, Client, Service, Settings } from './types';
import { versions, type SchemaVersion } from './schema';

export class VizitaiDB extends Dexie {
  clients!: Table<Client, string>;
  appointments!: Table<Appointment, string>;
  services!: Table<Service, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'vizitai', extraVersions: SchemaVersion[] = []) {
    super(name);
    for (const v of [...versions, ...extraVersions]) {
      const ver = this.version(v.version).stores(v.stores);
      if (v.upgrade) ver.upgrade(v.upgrade);
    }
  }
}
export const db = new VizitaiDB();
