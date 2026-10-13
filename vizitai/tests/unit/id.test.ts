import { describe, it, expect, afterEach, vi } from 'vitest';
import { newId } from '../../src/logic/id';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const paths: [string, () => void][] = [
  ['crypto.randomUUID', () => {}],
  ['getRandomValues fallback', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto), randomUUID: undefined });
  }],
  ['Math.random fallback', () => { vi.stubGlobal('crypto', undefined); }],
];

afterEach(() => vi.unstubAllGlobals());

describe.each(paths)('newId via %s', (_name, setup) => {
  it('is a v4 UUID', () => {
    setup();
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(V4);
  });
  it('is unique over 1000 ids', () => {
    setup();
    expect(new Set(Array.from({ length: 1000 }, newId)).size).toBe(1000);
  });
});

it('uses crypto.randomUUID when it is a function', () => {
  vi.stubGlobal('crypto', { randomUUID: () => 'native-id' });
  expect(newId()).toBe('native-id');
});
