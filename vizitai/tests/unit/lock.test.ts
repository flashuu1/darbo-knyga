import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lockDocument } from '../../src/pwa/lock';

function fakeWindow() {
  const doc = new EventTarget();
  const win = Object.assign(new EventTarget(), { document: doc, scrollX: 0, scrollY: 0, scrollTo(x: number, y: number) { win.scrollX = x; win.scrollY = y; } });
  return win as unknown as Window & { scrollX: number; scrollY: number };
}

describe('lockDocument', () => {
  it('cancels Safari pinch gestures', () => {
    const win = fakeWindow();
    const off = lockDocument(win);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      expect(win.document.dispatchEvent(new Event(type, { cancelable: true }))).toBe(false);
    }
    off();
    expect(win.document.dispatchEvent(new Event('gesturestart', { cancelable: true }))).toBe(true);
  });
  it('puts a scrolled window back at the top', () => {
    const win = fakeWindow();
    lockDocument(win);
    win.scrollY = 120;
    win.dispatchEvent(new Event('scroll'));
    expect(win.scrollY).toBe(0);
  });
});

describe('locked document CSS and meta', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  it('fixes html and body, hides overflow, stops overscroll and pinch', () => {
    const rule = /^html, body \{[^}]*\}/m.exec(css)?.[0] ?? '';
    for (const d of ['position: fixed', 'inset: 0', 'overflow: hidden', 'overscroll-behavior: none', 'touch-action: pan-x pan-y']) expect(rule).toContain(d);
  });
  it('disables zoom in the viewport meta and keeps the text-size-following root font', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/name="viewport" content="[^"]*maximum-scale=1, user-scalable=no, viewport-fit=cover"/);
    expect(css).toMatch(/font: -apple-system-body/);
  });
});
