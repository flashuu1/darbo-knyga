import { describe, it, expect } from 'vitest';
import { checkBase, normalizeBase } from '../../scripts/base-check.mjs';

const html = (b: string) => `<link rel="icon" href="${b}icon.svg"><script src="${b}assets/a.js"></script><a href="https://x.y/z">x</a>`;
const manifest = (b: string) => ({ start_url: b, scope: b, icons: [{ src: 'icon-192.png' }] });

describe('normalizeBase', () => {
  it('adds missing slashes', () => {
    expect(normalizeBase('darbo-knyga')).toBe('/darbo-knyga/');
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('')).toBe('/');
  });
});

describe('checkBase', () => {
  const B = '/darbo-knyga/';
  it('accepts a consistent build', () => {
    expect(checkBase({ base: B, html: html(B), manifest: manifest(B), precacheUrls: ['index.html', 'assets/a.js'] })).toEqual([]);
  });
  it('accepts relative manifest URLs', () => {
    expect(checkBase({ base: B, html: html(B), manifest: { start_url: './', scope: './', icons: [] } })).toEqual([]);
  });
  it('flags root-absolute html URLs', () => {
    const p = checkBase({ base: B, html: html('/'), manifest: manifest(B) });
    expect(p).toHaveLength(2);
  });
  it('flags a root manifest scope and start_url', () => {
    const p = checkBase({ base: B, html: html(B), manifest: manifest('/') });
    expect(p.join('\n')).toMatch(/start_url/);
    expect(p.join('\n')).toMatch(/scope/);
  });
  it('flags root-absolute precache URLs', () => {
    expect(checkBase({ base: B, html: html(B), manifest: manifest(B), precacheUrls: ['/assets/a.js'] })).toHaveLength(1);
  });
  it('adapts to another base', () => {
    expect(checkBase({ base: '/x/', html: html('/x/'), manifest: manifest('/x/') })).toEqual([]);
    expect(checkBase({ base: '/x/', html: html(B), manifest: manifest(B) }).length).toBeGreaterThan(0);
  });
});
