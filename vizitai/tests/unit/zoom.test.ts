import { describe, it, expect } from 'vitest';
import { clampZoom, densityFor, pinchZoom, ZOOM_MAX, ZOOM_MIN } from '../../src/logic/zoom';

describe('calendar zoom', () => {
  it('pinching OUT (fingers apart) shows more time: the zoom gets smaller', () => {
    expect(pinchZoom(1, 100, 200)).toBeCloseTo(0.5);
    expect(pinchZoom(1, 100, 150)).toBeCloseTo(0.667, 2);
  });
  it('pinching IN (fingers together) makes the hours bigger', () => {
    expect(pinchZoom(1, 200, 100)).toBeCloseTo(2);
  });
  it('is limited, and ignores nonsense', () => {
    expect(pinchZoom(1, 100, 10000)).toBe(ZOOM_MIN);
    expect(pinchZoom(1, 10000, 100)).toBe(ZOOM_MAX);
    expect(pinchZoom(1.3, 0, 100)).toBe(1.3);
    expect(clampZoom(NaN)).toBe(1);
  });
  it('drops details as rows get small', () => {
    expect(densityFor(1)).toBe('normal');
    expect(densityFor(0.6)).toBe('tight');
    expect(densityFor(0.25)).toBe('tiny');
  });
});
