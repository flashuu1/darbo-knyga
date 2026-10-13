import { describe, it, expect } from 'vitest';
import { requestPersistence } from '../../src/pwa/persist';

describe('requestPersistence', () => {
  it('returns true when granted', async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe(true);
  });
  it('returns false when denied', async () => {
    expect(await requestPersistence({ persist: async () => false })).toBe(false);
  });
  it('returns false when the API throws', async () => {
    expect(await requestPersistence({ persist: async () => { throw new Error('x'); } })).toBe(false);
  });
  it('returns false when the API is missing', async () => {
    expect(await requestPersistence(undefined)).toBe(false);
  });
});
