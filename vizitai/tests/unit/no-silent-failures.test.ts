import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const files = walk('src');
// where an error may be written to the console without telling her: the one place that does it on purpose (and shows a toast), the screen
// for a failed start, and the background check for a new version of the app (not something she saved)
const ALLOWED = new Set(['src/ui/failure.ts', 'src/main.tsx', 'src/pwa/updates.ts']);
const norm = (p: string) => p.split('\\').join('/');

describe('a failed write is never only a line in the console', () => {
  it('console.error appears only in the few places that are allowed to (everything else goes through saveFailed / attempt)', () => {
    const bad = files.filter((f) => !ALLOWED.has(norm(f)) && /console\.error\(/.test(readFileSync(f, 'utf8'))).map(norm);
    expect(bad, `these files only log an error: use saveFailed(e, retry) or attempt(() => ...) from ui/failure.ts, so she sees it: ${bad.join(', ')}`).toEqual([]);
  });
  it('no catch block in the screens swallows an error with nothing in it', () => {
    const empty = files.filter((f) => norm(f).startsWith('src/ui/') && /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(readFileSync(f, 'utf8'))).map(norm);
    expect(empty, `an empty catch hides a failure: ${empty.join(', ')}`).toEqual([]);
  });
});
