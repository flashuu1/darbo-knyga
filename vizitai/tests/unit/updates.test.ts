import { describe, it, expect } from 'vitest';
import { createUpdateGate } from '../../src/pwa/updates';

function setup(busy = false, uptime = 1000) {
  const s = { busy, uptime, applied: 0 };
  const gate = createUpdateGate({ isBusy: () => s.busy, apply: () => { s.applied++; }, uptimeMs: () => s.uptime });
  return { s, gate };
}

describe('update gate', () => {
  it('applies immediately when an update is found during launch', () => {
    const { s, gate } = setup(false, 1000);
    gate.markPending();
    expect(s.applied).toBe(1);
  });
  it('waits for the next foreground when found mid-use', () => {
    const { s, gate } = setup(false, 60_000);
    gate.markPending();
    expect(s.applied).toBe(0);
    gate.poke();
    expect(s.applied).toBe(1);
  });
  it('never applies while a sheet is open', () => {
    const { s, gate } = setup(true, 1000);
    gate.markPending();
    gate.poke();
    expect(s.applied).toBe(0);
    s.busy = false;
    gate.poke();
    expect(s.applied).toBe(1);
  });
  it('applies only once', () => {
    const { s, gate } = setup(false, 1000);
    gate.markPending();
    gate.poke();
    gate.poke();
    expect(s.applied).toBe(1);
  });
});
