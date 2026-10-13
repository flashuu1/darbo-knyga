// Pure checks that a production dist/ is consistent with its base path (no file system access).

export function normalizeBase(b) {
  let s = String(b || '/').trim();
  if (!s.startsWith('/')) s = '/' + s;
  if (!s.endsWith('/')) s += '/';
  return s;
}

const ORIGIN = 'https://example.invalid';

/** Returns a list of problem descriptions (empty = consistent). */
export function checkBase({ base, html, manifest, precacheUrls = [] }) {
  const b = normalizeBase(base);
  const problems = [];
  for (const m of html.matchAll(/\s(?:href|src)\s*=\s*"([^"]*)"/g)) {
    const u = m[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(u)) continue; // external, data:, fragment
    if (!u.startsWith(b)) problems.push(`index.html URL "${u}" is not under ${b}`);
  }
  const manifestUrl = new URL(b + 'manifest.webmanifest', ORIGIN);
  for (const key of ['start_url', 'scope']) {
    const v = manifest[key];
    const p = typeof v === 'string' ? new URL(v, manifestUrl).pathname : null;
    if (p === null || !p.startsWith(b)) problems.push(`manifest ${key} "${v}" does not resolve under ${b}`);
  }
  if (manifest.start_url && manifest.scope) {
    const s = new URL(manifest.start_url, manifestUrl).pathname;
    const sc = new URL(manifest.scope, manifestUrl).pathname;
    if (!s.startsWith(sc)) problems.push(`manifest start_url ${s} is outside scope ${sc}`);
  }
  for (const icon of manifest.icons ?? []) {
    const p = new URL(icon.src, manifestUrl).pathname;
    if (!p.startsWith(b)) problems.push(`manifest icon "${icon.src}" does not resolve under ${b}`);
  }
  // sw.js sits at <base>sw.js; relative precache URLs resolve under it, root-absolute ones would escape.
  for (const u of precacheUrls) {
    const p = new URL(u, new URL(b + 'sw.js', ORIGIN)).pathname;
    if (!p.startsWith(b)) problems.push(`precache URL "${u}" resolves outside ${b}`);
  }
  return problems;
}
