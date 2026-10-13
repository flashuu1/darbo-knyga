import { describe, it, expect, vi } from 'vitest';

// The service-worker helper is a lazily loaded chunk; on a flaky start it can fail to load.
vi.mock('virtual:pwa-register', () => { throw new Error('chunk failed to load'); });

describe('initUpdates', () => {
  it('logs a failed load of the service-worker helper instead of leaving an unhandled rejection', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (r: unknown) => { unhandled.push(r); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const { initUpdates } = await import('../../src/pwa/updates');
      initUpdates(() => false);
      await vi.waitFor(() => expect(err).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      err.mockRestore();
    }
  });
});
