# Vizitai

An iPhone appointment book for a hairdresser, in Lithuanian. It replaces her paper book: a Home Screen web app (PWA) served as static files from GitHub Pages. It works offline, all data stays in IndexedDB on the phone, and there is no backend. Stack: Vite, TypeScript, Preact, Dexie; Vitest and Playwright (WebKit, iPhone profile) for tests.

Status: all milestones M0–M8 are built and tested locally. Nothing has been pushed yet, so the CI and deploy workflows have **not** run on GitHub.

## Scripts

Run in this folder:

| Command | What it does |
| --- | --- |
| `npm ci` | Install exact dependencies |
| `npm run dev` | Dev server. A normal browser tab shows only the install screen; to use the app on a computer, run `npm run build:e2e && npm run preview:e2e` (test build, treated as installed) and open http://localhost:4173 |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright, WebKit iPhone). First time: `npx playwright install webkit`. Builds into `dist-e2e/` (test build at `/`) and `dist-prod-base/` (production build served at `/darbo-knyga/` for `tests/e2e/prod-base.spec.ts`), never into `dist/` |
| `npm run build` | Type-check and production build into `dist/` (base `/darbo-knyga/`) |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm run scan:bundle` | After a build: fails on English UI strings in the bundle or a broken service-worker precache list |

## Deploy

The app is a GitHub Pages project site: repo `flashuu1/darbo-knyga`, URL **https://flashuu1.github.io/darbo-knyga/**. Prerequisite: Settings → Pages → Source is set to **GitHub Actions**. The origin `https://flashuu1.github.io` and the path `/darbo-knyga/` are permanent: her data lives in IndexedDB for that origin, so changing the account, repo name or path strands it. Other sites on the `flashuu1` account share the origin, so keep their IndexedDB names distinct from `vizitai`.

The production build uses the base path from `site.config.json` (`VIZITAI_BASE` overrides it for experiments); `vite dev` and the e2e build use `/`. `npm run scan:bundle` fails if `dist/` does not match the base. A push to `main` runs `.github/workflows/deploy.yml` (lint, type-check, tests, build, bundle scan, then Pages). The e2e tests are not part of the GitHub pipeline: run `npm run e2e` locally before pushing.

On the iPhone: open the URL in Safari, tap Share → Add to Home Screen, then always open the app from that icon.

**Which build is installed.** Settings shows the version and a build row, "Sukurta: 2026 m. spalio 14 d. 15:42 · abc1234": the build time in Vilnius time and the short commit hash (`__BUILD_TIME__` and `__BUILD_ID__`, set in `vite.config.ts`; in GitHub Actions the hash comes from `GITHUB_SHA`, locally from `git rev-parse`, otherwise `dev`). After a deploy the app downloads the new build in the background and switches to it on the next open or when it comes back to the foreground (never while a sheet is open), so compare the hash with the latest commit on `main` to see whether the update has arrived.

## On-device checklist

Things the e2e tests cannot prove; check them on her iPhone before handing it over:

1. It installs to the Home Screen, and the install-screen wording matches her Share menu exactly (the wording in `src/i18n/lt.ts` is provisional).
2. Tapping an empty slot opens the sheet with the keyboard already up (also "+", "Registruoti" and "Kartoti").
3. With the keyboard up, the service chips and the time row can be reached; tapping outside the sheet hides the keyboard and keeps the typed name.
4. "Perkelti": the date and time wheels open, and the move is saved only when they close.
5. The share sheet opens from the backup banner and from Settings, and the file can be saved and restored.
6. Airplane mode: the app opens and works.
7. Dark mode and the status bar look right.
8. Largest text size (Settings → Accessibility → Larger Text) stays usable.
9. Long-press drag: lift after a hold, edge flip to the next day, drop on a week-strip chip.
10. A long press never shows the text callout or the magnifier.

## Contents

| File | Purpose |
| --- | --- |
| `docs/architecture.md` | Full spec: constraints, architecture, data model, screens, flows, iOS rules, Lithuanian strings, suggestions, open decisions, acceptance tests |
| `AGENTS.md` | Rules, repo layout and build order for coding agents |
| `CLAUDE.md` | Loads `AGENTS.md` and the spec for Claude Code |
