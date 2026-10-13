import { describe, it, expect } from 'vitest';
import { detectStandalone } from '../../src/pwa/standalone';

describe('detectStandalone', () => {
  it('is false in a plain Safari tab', () => {
    expect(detectStandalone({ navigatorStandalone: false, displayModeStandalone: false, e2e: false })).toBe(false);
  });
  it('is true for iOS navigator.standalone', () => {
    expect(detectStandalone({ navigatorStandalone: true, displayModeStandalone: false, e2e: false })).toBe(true);
  });
  it('is true for display-mode standalone', () => {
    expect(detectStandalone({ displayModeStandalone: true, e2e: false })).toBe(true);
  });
  it('is true under the e2e override', () => {
    expect(detectStandalone({ displayModeStandalone: false, e2e: true })).toBe(true);
  });
});
