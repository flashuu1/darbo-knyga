# M0 – Scaffold, PWA, install gate, deploy

Read `2026-10-13-vizitai-00-index.md` first (conventions, global constraints). Branch: `m0-scaffold`. **Done when:** opens from the iPhone Home Screen and loads in airplane mode.

### Task 1: Repo and Vite/Preact/TS scaffold

**Files:**
- Create: `.gitignore` (git root), `vizitai/package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/env.d.ts`, `tests/unit/setup.ts`

**Interfaces:**
- Produces: npm scripts `dev, build, build:e2e, preview:e2e, typecheck, lint, test, e2e, icons, scan:bundle`; global `__APP_VERSION__: string`.

- [ ] **Step 1: Init git and commit the existing docs**

```bash
cd /c/dnnna/rulebook
git init -b main
printf 'node_modules/\ndist/\ndev-dist/\nplaywright-report/\ntest-results/\n*.local\n' > .gitignore
git add .
git commit -m "docs: add Vizitai spec and agent instructions"
git checkout -b m0-scaffold
```
(Owner must create a public repo named `<account>.github.io`, then: `git remote add origin https://github.com/<account>/<account>.github.io.git && git push -u origin main`.)

- [ ] **Step 2: Install dependencies**

```bash
cd vizitai
npm init -y
npm i preact dexie
npm i -D vite @preact/preset-vite typescript vite-plugin-pwa vitest fake-indexeddb @playwright/test eslint @eslint/js typescript-eslint sharp
```
Set `"type": "module"`, `"private": true`, `"version": "0.1.0"` in `package.json` and replace `scripts`:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "build:e2e": "vite build --mode e2e",
  "preview:e2e": "vite preview --port 4173 --strictPort",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "test": "vitest run --passWithNoTests",
  "e2e": "playwright test",
  "icons": "node scripts/make-icons.mjs",
  "scan:bundle": "node scripts/scan-bundle.mjs"
}
```

- [ ] **Step 3: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "jsx": "react-jsx", "jsxImportSource": "preact",
    "resolveJsonModule": true, "skipLibCheck": true, "noEmit": true,
    "types": ["vite/client", "vite-plugin-pwa/client"]
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts` (PWA plugin is added in Task 2):
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [preact()],
  build: { target: 'es2022' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
});
```

`tests/unit/setup.ts`: `import 'fake-indexeddb/auto';`

`src/env.d.ts`: `declare const __APP_VERSION__: string;`

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
```

`index.html`:
```html
<!doctype html>
<html lang="lt">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Vizitai</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx` (temporary):
```tsx
import { render } from 'preact';
render(<p>Vizitai</p>, document.getElementById('app')!);
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all exit 0; `dist/index.html` exists.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite, Preact, TypeScript, Vitest, ESLint"
```

### Task 2: PWA manifest, icons, iOS meta tags

**Files:**
- Create: `public/icon.svg`, `scripts/make-icons.mjs`, generated `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- Modify: `vite.config.ts`, `index.html`

**Interfaces:**
- Produces: manifest + precaching service worker emitted by `vite build`; `virtual:pwa-register` module (used in Task 4).

- [ ] **Step 1: Icon source and generator**

`public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ff2d55"/>
  <rect x="96" y="120" width="320" height="296" rx="36" fill="#fff"/>
  <rect x="96" y="120" width="320" height="76" rx="36" fill="#ff3b30"/>
  <rect x="96" y="160" width="320" height="36" fill="#ff3b30"/>
  <circle cx="176" cy="96" r="18" fill="#fff"/><circle cx="336" cy="96" r="18" fill="#fff"/>
  <path d="M176 300l56 56 112-112" fill="none" stroke="#ff2d55" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

`scripts/make-icons.mjs`:
```js
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${file}`, import.meta.url)));
}
console.log('icons written');
```
Run: `npm run icons` → Expected: `icons written`, three PNGs in `public/`.

- [ ] **Step 2: Add the PWA plugin** — in `vite.config.ts` add `import { VitePWA } from 'vite-plugin-pwa';` and replace `plugins`:

```ts
plugins: [
  preact(),
  VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['apple-touch-icon.png', 'icon.svg'],
    manifest: {
      name: 'Vizitai', short_name: 'Vizitai', lang: 'lt',
      display: 'standalone', orientation: 'portrait',
      start_url: '/', scope: '/',
      theme_color: '#f2f2f7', background_color: '#f2f2f7',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'], navigateFallback: 'index.html' },
  }),
],
```

- [ ] **Step 3: iOS meta tags** — add inside `<head>` of `index.html`:

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f2f2f7" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Vizitai" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
```
(`index.html` is source markup, not a runtime UI string; the `<title>` stays "Vizitai".)

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: `dist/` contains `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add PWA manifest, service worker, icons and iOS meta tags"
```

### Task 3: Lithuanian strings, standalone gate, install screen, app shell

**Files:**
- Create: `src/i18n/lt.ts`, `src/i18n/format.ts`, `src/pwa/standalone.ts`, `src/pwa/persist.ts`, `src/ui/icons.tsx`, `src/ui/screens/Install.tsx`, `src/ui/components/TabBar.tsx`, `src/app.tsx`, `src/styles.css`, `playwright.config.ts`
- Modify: `src/main.tsx`
- Test: `tests/unit/standalone.test.ts`, `tests/unit/persist.test.ts`, `tests/unit/format.test.ts`, `tests/unit/no-literals.test.ts`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `t(key: Key, params?: Record<string, string|number>): string`; `Key` type; `lt` object.
- Produces: `detectStandalone(env: StandaloneEnv): boolean`, `isStandalone(): boolean`; `requestPersistence(storage?): Promise<boolean>`.
- Produces: `formatDayLong(date)`, `formatDayShort(date)`, `weekdayShort(date)`, `monthName(date)`, `formatWhen(start)` — all take `YYYY-MM-DD` (or full start for `formatWhen`), all format in UTC so the machine timezone is irrelevant.

- [ ] **Step 1: Write failing unit tests**

`tests/unit/standalone.test.ts`:
```ts
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
```

`tests/unit/persist.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { requestPersistence } from '../../src/pwa/persist';

describe('requestPersistence', () => {
  it('returns true when granted', async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe(true);
  });
  it('returns false when denied', async () => {
    expect(await requestPersistence({ persist: async () => false })).toBe(false);
  });
  it('returns false when the API throws', async () => {
    expect(await requestPersistence({ persist: async () => { throw new Error('x'); } })).toBe(false);
  });
  it('returns false when the API is missing', async () => {
    expect(await requestPersistence(undefined)).toBe(false);
  });
});
```

`tests/unit/format.test.ts` (values from the spec; if ICU differs, fix `format.ts` or note it in the PR):
```ts
import { describe, it, expect } from 'vitest';
import { formatDayLong, formatDayShort, weekdayShort, formatWhen } from '../../src/i18n/format';

describe('lt-LT formatting', () => {
  it('formats the long day', () => expect(formatDayLong('2026-10-14')).toBe('spalio 14 d., trečiadienis'));
  it('formats the short day', () => expect(formatDayShort('2026-10-14')).toBe('spalio 14 d.'));
  it('uses Lithuanian short weekdays', () => {
    const days = ['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18'].map(weekdayShort);
    expect(days).toEqual(['pr', 'an', 'tr', 'kt', 'pn', 'št', 'sk']);
  });
  it('formats a start time', () => expect(formatWhen('2026-10-14T10:30')).toBe('spalio 14 d., tr · 10:30'));
});
```

`tests/unit/no-literals.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — modules `../../src/pwa/standalone`, `persist`, `i18n/format` not found.

- [ ] **Step 3: Implement pure modules**

`src/pwa/standalone.ts`:
```ts
export interface StandaloneEnv {
  navigatorStandalone?: boolean;
  displayModeStandalone: boolean;
  e2e: boolean;
}
export const detectStandalone = (e: StandaloneEnv): boolean =>
  e.e2e || e.navigatorStandalone === true || e.displayModeStandalone;

export function isStandalone(): boolean {
  return detectStandalone({
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
    e2e: import.meta.env.MODE === 'e2e' && !new URLSearchParams(location.search).has('safari'),
  });
}
```

`src/pwa/persist.ts`:
```ts
export async function requestPersistence(
  storage: Pick<StorageManager, 'persist'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage,
): Promise<boolean> {
  try {
    return (await storage?.persist?.()) === true;
  } catch {
    return false;
  }
}
```

`src/i18n/format.ts`:
```ts
const utc = { timeZone: 'UTC' } as const;
const L = 'lt-LT';
const long = new Intl.DateTimeFormat(L, { ...utc, month: 'long', day: 'numeric', weekday: 'long' });
const short = new Intl.DateTimeFormat(L, { ...utc, month: 'long', day: 'numeric' });
const wd = new Intl.DateTimeFormat(L, { ...utc, weekday: 'short' });
const month = new Intl.DateTimeFormat(L, { ...utc, month: 'long' });
const d = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`);

export const formatDayLong = (date: string) => long.format(d(date));
export const formatDayShort = (date: string) => short.format(d(date));
export const weekdayShort = (date: string) => wd.format(d(date));
export const monthName = (date: string) => month.format(d(date));
export const formatWhen = (start: string) =>
  `${formatDayShort(start)}, ${weekdayShort(start)} · ${start.slice(11, 16)}`;
```

- [ ] **Step 4: Strings** — `src/i18n/lt.ts` holds every string for M0–M8 (unused keys are fine):

```ts
export const lt = {
  'app.name': 'Vizitai',
  'tab.calendar': 'Kalendorius', 'tab.clients': 'Klientai', 'tab.settings': 'Nustatymai',
  'view.day': 'Diena', 'view.week': 'Savaitė', 'view.month': 'Mėnuo',
  'nav.today': 'Šiandien', 'nav.back': 'Atgal',
  'sheet.new.title': 'Naujas vizitas',
  'type.client': 'Klientas', 'type.personal': 'Asmeninis',
  'field.name': 'Kliento vardas', 'field.title': 'Pavadinimas',
  'field.service': 'Paslauga', 'field.time': 'Laikas',
  'suggest.recent': 'Neseniai',
  'btn.save': 'Išsaugoti', 'btn.dismiss': 'Atšaukti', 'btn.close': 'Uždaryti',
  'act.move': 'Perkelti', 'act.noshow': 'Neatvyko', 'act.cancelAppt': 'Atšaukti vizitą', 'act.restore': 'Atkurti vizitą',
  'cancel.question': 'Atšaukti vizitą?',
  'cancel.reason.client': 'Kliento prašymu', 'cancel.reason.ill': 'Liga', 'cancel.reason.other': 'Kita',
  'cancel.reason.none': 'Be priežasties', 'cancel.keep': 'Palikti',
  'status.booked': 'Užregistruota', 'status.done': 'Įvyko', 'status.cancelled': 'Atšaukta', 'status.noshow': 'Neatvyko',
  'appt.status': 'Būsena',
  'toast.moved': 'Perkelta: {data} · {laikas}', 'toast.cancelled': 'Vizitas atšauktas',
  'toast.restored': 'Vizitas atkurtas', 'toast.noshow': 'Pažymėta: neatvyko', 'toast.undo': 'Anuliuoti',
  'warn.overlap': 'Šiuo laiku jau užregistruota: {vardas} – {paslauga}',
  'empty.day': 'Šią dieną vizitų nėra',
  'clients.search': 'Ieškoti', 'clients.empty': 'Klientų dar nėra',
  'client.upcoming': 'Būsimi vizitai', 'client.past': 'Ankstesni vizitai',
  'client.book': 'Registruoti', 'client.phone': 'Telefonas', 'client.none': 'Vizitų nėra',
  'client.visitCount': 'Vizitų skaičius: {n}', 'client.cancelledCount': 'Atšaukė: {n}', 'client.noshowCount': 'Neatvyko: {n}',
  'client.lastVisit': 'Paskutinis vizitas: {data}',
  'settings.services': 'Paslaugos', 'settings.hours': 'Darbo laikas', 'settings.backup': 'Atsarginė kopija',
  'settings.version': 'Versija', 'settings.storage': 'Saugykla',
  'service.add': 'Pridėti paslaugą', 'service.new': 'Nauja paslauga', 'service.hide': 'Paslėpti', 'service.show': 'Rodyti',
  'service.hidden': 'Paslėpta', 'service.minutes': 'Trukmė (min.)', 'service.lastActive': 'Turi likti bent viena paslauga',
  'service.default.cut': 'Kirpimas', 'service.default.color': 'Dažymas', 'service.default.cutColor': 'Kirpimas ir dažymas',
  'service.default.highlights': 'Sruogelės', 'service.default.style': 'Šukuosena', 'service.default.other': 'Kita',
  'hours.start': 'Pradžia', 'hours.end': 'Pabaiga', 'hours.invalid': 'Pabaiga turi būti vėlesnė už pradžią',
  'backup.export': 'Eksportuoti duomenis', 'backup.import': 'Atkurti iš failo',
  'backup.confirm': 'Pakeisti visus esamus duomenis?', 'backup.replace': 'Pakeisti',
  'backup.imported': 'Duomenys atkurti', 'backup.exported': 'Kopija sukurta',
  'backup.error.format': 'Netinkamas failas', 'backup.error.newer': 'Failas sukurtas naujesnės programos versijos',
  'backup.last': 'Paskutinė kopija: {data}', 'backup.never': 'Kopijos dar nėra',
  'backup.banner': 'Sukurti atsarginę kopiją?',
  'repeat.action': 'Kartoti', 'repeat.title': 'Kartoti po', 'repeat.weeks': 'po {n} sav.',
  'storage.persistent': 'Duomenys apsaugoti nuo išvalymo',
  'storage.notPersistent': 'Duomenys gali būti išvalyti – sukurkite atsarginę kopiją',
  'install.title': 'Įdiekite programėlę pagrindiniame ekrane',
  // Provisional wording: verify against her iPhone's Share menu (spec: install screen).
  'install.step.share': 'Paspauskite mygtuką „Bendrinti“ (kvadratas su rodykle aukštyn).',
  'install.step.add': 'Pasirinkite „Pridėti prie pagrindinio ekrano“.',
  'install.step.open': 'Atidarykite programėlę iš jos piktogramos pagrindiniame ekrane.',
} as const;

export type Key = keyof typeof lt;

export function t(key: Key, params?: Record<string, string | number>): string {
  let s: string = lt[key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
```

- [ ] **Step 5: Run unit tests**

Run: `npm test`
Expected: standalone, persist, format PASS. `no-literals` passes (no TSX yet).

- [ ] **Step 6: UI shell**

`src/ui/icons.tsx`:
```tsx
const base = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;
export const CalendarIcon = () => (<svg {...base}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>);
export const PeopleIcon = () => (<svg {...base}><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c.6-3.4 3-5 6-5s5.4 1.600 6 5" /><path d="M16 5.500a3 3 0 010 6M18 14.200c1.700.6 2.700 2.200 3 4.800" /></svg>);
export const GearIcon = () => (<svg {...base}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800" /></svg>);
export const PlusIcon = () => (<svg {...base}><path d="M12 5v14M5 12h14" /></svg>);
export const ChevronIcon = () => (<svg {...base} width={14} height={14}><path d="M6 9l6 6 6-6" /></svg>);
```

`src/ui/screens/Install.tsx`:
```tsx
import { t } from '../../i18n/lt';
export function InstallScreen() {
  return (
    <main class="install" data-testid="install">
      <h1>{t('install.title')}</h1>
      <ol>
        <li>{t('install.step.share')}</li>
        <li>{t('install.step.add')}</li>
        <li>{t('install.step.open')}</li>
      </ol>
    </main>
  );
}
```

`src/ui/components/TabBar.tsx` (the active tab is a prop for now; Task 8 replaces it with the store):
```tsx
import { t, type Key } from '../../i18n/lt';
import { CalendarIcon, GearIcon, PeopleIcon } from '../icons';

export type Tab = 'calendar' | 'clients' | 'settings';
const TABS: { id: Tab; label: Key; icon: () => preact.JSX.Element }[] = [
  { id: 'calendar', label: 'tab.calendar', icon: CalendarIcon },
  { id: 'clients', label: 'tab.clients', icon: PeopleIcon },
  { id: 'settings', label: 'tab.settings', icon: GearIcon },
];

export function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav class="tabbar">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} data-testid={`tab-${id}`} class={active === id ? 'tab active' : 'tab'} onClick={() => onSelect(id)}>
          <Icon />
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}
```

`src/app.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { t } from './i18n/lt';
import { TabBar, type Tab } from './ui/components/TabBar';

export function App() {
  const [tab, setTab] = useState<Tab>('calendar');
  return (
    <div class="app" data-testid="app">
      <main class="screen"><h1 class="large-title">{t(`tab.${tab}`)}</h1></main>
      <TabBar active={tab} onSelect={setTab} />
    </div>
  );
}
```

`src/main.tsx`:
```tsx
import { render } from 'preact';
import './styles.css';
import { isStandalone } from './pwa/standalone';
import { InstallScreen } from './ui/screens/Install';

async function boot() {
  const root = document.getElementById('app')!;
  if (!isStandalone()) {
    render(<InstallScreen />, root); // Safari tab: nothing else is loaded, nothing is written
    return;
  }
  const [{ db }, { ensureSeed }, { requestPersistence }, { App }] = await Promise.all([
    import('./db/db'), import('./db/seed'), import('./pwa/persist'), import('./app'),
  ]);
  await ensureSeed(db);
  const settings = await db.settings.get('settings');
  if (settings?.persistGranted !== true) {
    await db.settings.update('settings', { persistGranted: await requestPersistence() });
  }
  render(<App />, root);
}
void boot();
```
`db/db` and `db/seed` do not exist until Task 6; for M0 create temporary stubs so the build passes: `src/db/db.ts` exporting `export const db = { settings: { get: async () => undefined, update: async () => 0 } } as never;` and `src/db/seed.ts` exporting `export async function ensureSeed(_db: unknown) {}`. Both files are fully replaced in Task 6.

`src/styles.css`:
```css
:root {
  color-scheme: light dark;
  --bg: #f2f2f7; --card: #fff; --label: #000; --label2: rgba(60,60,67,.6); --sep: rgba(60,60,67,.29);
  --blue: #007aff; --red: #ff3b30; --fill: rgba(120,120,128,.12);
  --c-blue: #007aff; --c-green: #34c759; --c-indigo: #5856d6; --c-orange: #ff9500; --c-pink: #ff2d55;
  --c-purple: #af52de; --c-red: #ff3b30; --c-teal: #30b0c7; --c-yellow: #ffcc00; --c-gray: #8e8e93;
  --row: 2.75rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000; --card: #1c1c1e; --label: #fff; --label2: rgba(235,235,245,.6); --sep: rgba(84,84,88,.65);
    --blue: #0a84ff; --red: #ff453a; --fill: rgba(120,120,128,.24);
    --c-blue: #0a84ff; --c-green: #30d158; --c-indigo: #5e5ce6; --c-orange: #ff9f0a; --c-pink: #ff375f;
    --c-purple: #bf5af2; --c-red: #ff453a; --c-teal: #40c8e0; --c-yellow: #ffd60a; --c-gray: #98989d;
  }
}
html { font: 17px/1.3 system-ui, sans-serif; font: -apple-system-body; background: var(--bg); color: var(--label); overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
body { margin: 0; touch-action: manipulation; overscroll-behavior: none; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; min-height: 44px; min-width: 44px; cursor: pointer; }
input, select { font: inherit; font-size: max(16px, 1rem); color: inherit; }
.app { display: flex; flex-direction: column; height: 100dvh; padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left); box-sizing: border-box; }
.screen { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.large-title { font-size: 1.8rem; margin: .6rem 1rem .4rem; }
.tabbar { display: flex; border-top: .5px solid var(--sep); background: var(--card); padding-bottom: env(safe-area-inset-bottom); }
.tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: .7rem; color: var(--label2); gap: 2px; }
.tab.active { color: var(--blue); }
.install { padding: 2rem 1.2rem; }
.install ol { padding-left: 1.2rem; line-height: 1.6; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```

- [ ] **Step 7: Playwright config and e2e smoke**

Run: `npx playwright install webkit`, then `node -e "console.log(Object.keys(require('@playwright/test').devices).filter(n=>/iPhone 1[5-9] Pro Max$/.test(n)))"`. Use the newest listed name below (examples use `iPhone 15 Pro Max`).

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: { ...devices['iPhone 15 Pro Max'], baseURL: 'http://localhost:4173', serviceWorkers: 'block', locale: 'lt-LT', timezoneId: 'Europe/Vilnius' },
  webServer: {
    command: 'npm run build:e2e && npm run preview:e2e',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

`tests/e2e/shell.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('standalone launch shows the three Lithuanian tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('tab-calendar')).toHaveText('Kalendorius');
  await expect(page.getByTestId('tab-clients')).toHaveText('Klientai');
  await expect(page.getByTestId('tab-settings')).toHaveText('Nustatymai');
});

test('a Safari tab shows only the install screen and writes nothing', async ({ page }) => {
  await page.goto('/?safari');
  await expect(page.getByTestId('install')).toContainText('Įdiekite programėlę pagrindiniame ekrane');
  const dbs = await page.evaluate(() => indexedDB.databases());
  expect(dbs).toEqual([]);
});
```

- [ ] **Step 8: Run everything**

Run: `npm run typecheck && npm run lint && npm test && npm run e2e`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add Lithuanian strings, standalone gate, install screen and app shell"
```

### Task 4: Update gate, CI, deploy

**Files:**
- Create: `src/pwa/updates.ts`, `scripts/scan-bundle.mjs`, `../.github/workflows/ci.yml`, `../.github/workflows/deploy.yml`
- Modify: `src/main.tsx`, `README.md`
- Test: `tests/unit/updates.test.ts`

**Interfaces:**
- Produces: `createUpdateGate({ isBusy, apply, uptimeMs }): { markPending(): void; poke(): void }`; `initUpdates(isBusy: () => boolean): () => void` (returns `poke`).

- [ ] **Step 1: Write the failing test** — `tests/unit/updates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createUpdateGate } from '../../src/pwa/updates';

function setup(busy = false, uptime = 1000) {
  const s = { busy, uptime, applied: 0 };
  const gate = createUpdateGate({ isBusy: () => s.busy, apply: () => { s.applied++; }, uptimeMs: () => s.uptime });
  return { s, gate };
}

describe('update gate', () => {
  it('applies immediately when an update is found during launch', () => {
    const { s, gate } = setup(false, 1000);
    gate.markPending();
    expect(s.applied).toBe(1);
  });
  it('waits for the next foreground when found mid-use', () => {
    const { s, gate } = setup(false, 60_000);
    gate.markPending();
    expect(s.applied).toBe(0);
    gate.poke();
    expect(s.applied).toBe(1);
  });
  it('never applies while a sheet is open', () => {
    const { s, gate } = setup(true, 1000);
    gate.markPending();
    gate.poke();
    expect(s.applied).toBe(0);
    s.busy = false;
    gate.poke();
    expect(s.applied).toBe(1);
  });
  it('applies only once', () => {
    const { s, gate } = setup(false, 1000);
    gate.markPending();
    gate.poke();
    gate.poke();
    expect(s.applied).toBe(1);
  });
});
```

- [ ] **Step 2: Run** `npm test -- updates` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/pwa/updates.ts`:

```ts
import { registerSW } from 'virtual:pwa-register';

export interface GateDeps { isBusy: () => boolean; apply: () => void; uptimeMs: () => number }
const LAUNCH_WINDOW_MS = 5000;

export function createUpdateGate({ isBusy, apply, uptimeMs }: GateDeps) {
  let pending = false;
  const poke = () => {
    if (pending && !isBusy()) { pending = false; apply(); }
  };
  const markPending = () => {
    pending = true;
    if (uptimeMs() < LAUNCH_WINDOW_MS) poke(); // found at launch: activate now; otherwise wait for next foreground
  };
  return { markPending, poke };
}

export function initUpdates(isBusy: () => boolean): () => void {
  let reload: (reloadPage?: boolean) => Promise<void> = async () => {};
  const gate = createUpdateGate({ isBusy, apply: () => void reload(true), uptimeMs: () => performance.now() });
  reload = registerSW({
    onNeedRefresh: gate.markPending,
    onRegisteredSW: (_url, reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { void reg?.update(); gate.poke(); }
      });
    },
  });
  return gate.poke;
}
```

- [ ] **Step 4: Run** `npm test -- updates` → PASS.

- [ ] **Step 5: Wire it in** — in `src/main.tsx` after `render(<App />, root);` add `initUpdates(() => false);` with `import { initUpdates } from './pwa/updates';` (Task 8 replaces `() => false` with the real sheet-open check).

- [ ] **Step 6: Bundle scan and workflows**

`scripts/scan-bundle.mjs` (fails the build if common English UI words appear as standalone string literals):
```js
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../dist/assets/', import.meta.url);
const banned = ['Cancel', 'Save', 'Today', 'Settings', 'Search', 'Undo', 'Delete', 'Close', 'Calendar', 'Clients', 'Appointment', 'Loading', 'Error'];
let bad = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  for (const w of banned) if (new RegExp(`["'\`]${w}["'\`]`).test(src)) bad.push(`${f}: "${w}"`);
}
if (bad.length) { console.error('English UI strings in bundle:\n' + bad.join('\n')); process.exit(1); }
console.log('bundle scan clean');
```

`../.github/workflows/ci.yml`:
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
defaults:
  run:
    working-directory: vizitai
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: vizitai/package-lock.json }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run scan:bundle
      - run: npx playwright install --with-deps webkit
      - run: npm run e2e
        env: { CI: 'true' }
```

`../.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: vizitai
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: vizitai/package-lock.json }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm run scan:bundle
      - uses: actions/upload-pages-artifact@v3
        with: { path: vizitai/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

README: replace the "Deploy (after M0)" section with: repo must be named `<account>.github.io` (Settings → Pages → Source: GitHub Actions); push to `main` deploys; on the iPhone open the URL in Safari, Share → add to Home Screen, then always open from the icon.

- [ ] **Step 7: Verify** `npm run build && npm run scan:bundle` → "bundle scan clean". `npm run typecheck && npm run lint && npm test && npm run e2e` → PASS.

- [ ] **Step 8: Commit, push, PR**

```bash
git add -A && git commit -m "feat: add update gate, CI and Pages deploy"
git push -u origin m0-scaffold
gh pr create --title "M0: scaffold, PWA, install gate, deploy" --body "Implements M0. Assumptions: provisional install wording (verify on device); dev deps fake-indexeddb, sharp (icons), playwright, eslint added per plan.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 9: Manual device check (owner, after merge and first deploy)**
  - [ ] Open the Pages URL in Safari → install screen appears; confirm the Share-menu wording on her iPhone and correct `install.step.*` in `lt.ts` if it differs.
  - [ ] Add to Home Screen; open from the icon → full-screen, safe areas respected, light and dark.
  - [ ] Airplane mode → relaunch → app still loads.
