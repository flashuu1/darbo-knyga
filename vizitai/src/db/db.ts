// Temporary stub; fully replaced in Task 6.
interface SettingsStub {
  get(key: string): Promise<{ persistGranted?: boolean } | undefined>;
  update(key: string, changes: { persistGranted: boolean }): Promise<number>;
}
export const db: { settings: SettingsStub } = { settings: { get: async () => undefined, update: async () => 0 } };
