import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}
const JSX_TEXT = />([^<>{}]*[A-Za-zĄ-ž][^<>{}]*)<\//;
const ATTR = /\b(placeholder|aria-label|title|alt)="[^"]*[A-Za-zĄ-ž]/;

describe('no inline UI literals in TSX', () => {
  for (const f of files('src')) {
    it(f, () => {
      const bad = readFileSync(f, 'utf8').split('\n').filter((l) => JSX_TEXT.test(l) || ATTR.test(l));
      expect(bad).toEqual([]);
    });
  }
});
