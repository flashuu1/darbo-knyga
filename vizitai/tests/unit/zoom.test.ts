import { describe, it, expect } from 'vitest';
import { clampZoom, densityFor, labelStep, pinchZoom, snapZoom, ZOOM_MAX, ZOOM_MIN } from '../../src/logic/zoom';

describe('calendar zoom', () => {
  it('fingers apart zoom in: the hours get bigger', () => {
    expect(pinchZoom(1, 100, 150)).toBeCloseTo(1.694, 2);
    expect(pinchZoom(1, 100, 100)).toBeCloseTo(1);
  });
  it('fingers together zoom out: more of the day fits', () => {
    expect(pinchZoom(1, 200, 100)).toBeCloseTo(0.406, 2);
  });
  it('is limited, and ignores nonsense', () => {
    expect(pinchZoom(1, 10000, 100)).toBe(ZOOM_MIN);
    expect(pinchZoom(1, 100, 10000)).toBe(ZOOM_MAX);
    expect(pinchZoom(1.3, 0, 100)).toBe(1.3);
    expect(clampZoom(NaN)).toBe(1);
  });
  it('shows fewer time labels the smaller the hours get', () => {
    expect(labelStep(1)).toBe(1);
    expect(labelStep(0.45)).toBe(1);
    expect(labelStep(0.35)).toBe(2);
    expect(labelStep(ZOOM_MIN)).toBe(3);
  });
  it('snaps to whole pixels per row', () => {
    expect(snapZoom(0.5 + 0.004) * 44).toBeCloseTo(22);
    expect(snapZoom(99)).toBeLessThanOrEqual(ZOOM_MAX);
  });
  it('drops details as rows get small', () => {
    expect(densityFor(1)).toBe('normal');
    expect(densityFor(0.6)).toBe('tight');
    expect(densityFor(0.25)).toBe('tiny');
  });
});
