import { describe, it, expect } from 'vitest';
import { classifyFrames } from '../../src/ui/perf';

const around = (ms: number, n = 40, jitter = 0.4) => Array.from({ length: n }, (_, i) => ms + (i % 2 ? jitter : -jitter));

describe('noticing Low Power Mode from the gaps between frames', () => {
  it('a clean 30 Hz is low', () => {
    expect(classifyFrames(around(33.3))).toBe('low');
    expect(classifyFrames(around(33.3, 40, 1.5))).toBe('low');
  });
  it('60 and 120 Hz are full', () => {
    expect(classifyFrames(around(16.7))).toBe('full');
    expect(classifyFrames(around(8.3))).toBe('full');
  });
  it('a busy moment is never taken for Low Power Mode', () => {
    const busy = Array.from({ length: 40 }, (_, i) => [16.7, 50, 16.7, 33, 90, 16.7, 33.3, 66][i % 8]!);
    expect(classifyFrames(busy)).toBe('unsure');
    expect(classifyFrames(around(45))).toBe('unsure'); // slow but not 30 Hz
    expect(classifyFrames(Array.from({ length: 40 }, (_, i) => (i % 2 ? 16 : 52)))).not.toBe('low'); // uneven, averaging 33: not a clean 30 Hz
  });
  it('too few frames is not enough to say', () => {
    expect(classifyFrames(around(33.3, 10))).toBe('unsure');
  });
  it('a few hitches among regular frames do not hide a real 30 Hz', () => {
    const g = around(33.3, 45); g[7] = 120; g[20] = 66; g[31] = 90;
    expect(classifyFrames(g)).toBe('low');
  });
});
