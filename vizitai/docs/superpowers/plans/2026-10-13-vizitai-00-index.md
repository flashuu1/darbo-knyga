# Vizitai M0–M8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vizitai offline Lithuanian iPhone appointment book through milestones M0–M8 of the spec (M9 excluded).

**Architecture:** Static Preact PWA. All state lives in IndexedDB via Dexie behind a `createRepo(db)` module; pure logic (time, names, overlap, layout, backup) is separate from UI and unit-tested. UI is Preact with a tiny external store and Dexie `liveQuery` hooks. No router: tab + sheet state live in one store.

**Tech Stack:** Vite, TypeScript, Preact, Dexie, vite-plugin-pwa, Vitest (+ fake-indexeddb), Playwright (WebKit, iPhone profile), ESLint, GitHub Actions.

**Spec:** `vizitai/docs/architecture.md` (approved). When this plan and the spec disagree, the spec wins; departures update the spec in the same PR.

## Plan files (execute in order, one PR per milestone)

| File | Milestones |
| --- | --- |
| `2026-10-13-vizitai-m0-scaffold.md` | M0 (Tasks 1–4) |
| `2026-10-13-vizitai-m1-data.md` | M1 (Tasks 5–7) |
| `2026-10-13-vizitai-m2-m3-calendar-add.md` | M2, M3 (Tasks 8–10) |
| `2026-10-13-vizitai-m4-m5-appointment-drag.md` | M4, M5 (Tasks 11–12) |
| `2026-10-13-vizitai-m6-m8-clients-settings.md` | M6, M7, M8 (Tasks 13–15) |

## Repo conventions

- Git root is `C:\dnnna\rulebook`; the app lives in `vizitai/`. All `npm`/`npx` commands run inside `vizitai/`. Workflows live in `.github/workflows/` at the git root and use `working-directory: vizitai`.
- The root-level `architecture.md` duplicates `vizitai/docs/architecture.md`; leave it alone (owner has not asked to delete it).
- Node 20+ required (global `crypto.randomUUID`, `File`, full ICU for `lt`).
- Install packages without pinned versions (`npm i <pkg>`) so current majors are used; if an API differs from the snippets, adapt and note it in the PR.
- Branch per milestone: `m0-scaffold`, `m1-data`, … Merge to `main` via PR (`gh pr create`). Pages deploys on push to `main`.
- Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Every PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Test ids: slots `slot-<YYYY-MM-DDTHH:mm>`, entries `entry-<id>`, tabs `tab-calendar|clients|settings`, sheet `sheet`, toast `toast`.
- E2E only: `vite build --mode e2e` treats the app as standalone (unless URL has `?safari`) and exposes `window.__vizitai = { db, repo, ui }`. Production builds contain neither.

## Global Constraints

- Language: every visible string is Lithuanian (lt-LT), from `src/i18n/lt.ts`; no inline UI literals. 24-hour time. Week starts Monday.
- Dates via `Intl.DateTimeFormat('lt-LT')` only; plurals via `Intl.PluralRules('lt')` or a label without a plural ("Vizitų skaičius: 5").
- No network at runtime: no backend, analytics, CDN fonts or scripts.
- Client name is the only free-text input when booking; service, date, time are picked.
- Only start time stored/shown. `start` is `YYYY-MM-DDTHH:mm` local wall-clock, snapped to 15 min, never converted to UTC. DST change 2026-10-25 must not shift anything.
- A new booking takes at most 3 taps plus typing the name.
- Schema changes only via Dexie version upgrades; never drop a store.
- Standalone only: in a Safari tab show only the install screen and write nothing.
- Undo is "Anuliuoti"; cancelling an appointment is "Atšaukti vizitą"; plain "Atšaukti" only dismisses a sheet.
- Overlaps warn, never block. Overlap = another `booked` appointment whose `[start, start+minutes)` intersects.
- Search compares `nameKey` (NFD, strip marks, lowercase); never `localeCompare`. Client lists sort with `Intl.Collator('lt')`.
- iOS look: `font: -apple-system-body` on root, sizes in `rem`, touch targets ≥ 44pt, inputs ≥ 16px, safe-area insets, `-webkit-touch-callout: none` + `user-select: none` on entries, `overscroll-behavior: none`, transitions 250–350 ms and disabled under `prefers-reduced-motion`.
- Origin is fixed: repo named `<account>.github.io`, Vite `base: '/'`. App name "Vizitai".
- No dependencies beyond the spec stack without stating the reason in the PR. Approved additions: `fake-indexeddb` (Node unit tests for Dexie), `sharp` (dev-only, rasterize icon SVG), `@playwright/test`, `eslint` + `typescript-eslint`.
- Assumptions made where the spec is silent (state them in PRs): personal entries last 60 min for overlap and block size; services default minutes 45/90/120/120/60/30; Share-menu install wording is provisional until checked on her iPhone.

## Review Focus

Inputs/conditions the spec implies but its acceptance list does not test; each has a test in the owning task.

1. **Bookings outside working hours** (before `dayStart`, past `dayEnd`, or crossing it) must stay visible; the timeline grows to fit (Task 8, `visibleRange`).
2. **Importing a wrong, corrupt, or newer-schema file** shows a Lithuanian error and leaves all existing data untouched (Task 7 and 14).
3. **Share sheet dismissed** must not update `lastBackupAt` (Task 7 and 14); `navigator.share` unavailable falls back to a download.
4. **Hiding the last active service** is refused, so the add sheet always has a service chip (Task 6 and 14).
5. **Week and month boundaries**: year end (28 Dec → 3 Jan), leap day, and the DST week all render the right dates (Task 5 and 9).

## File structure (relative to `vizitai/`)

```
package.json  tsconfig.json  vite.config.ts  eslint.config.js  playwright.config.ts  index.html
scripts/make-icons.mjs  scripts/scan-bundle.mjs
public/icon.svg  icon-192.png  icon-512.png  apple-touch-icon.png
src/main.tsx  src/app.tsx  src/styles.css  src/env.d.ts
src/i18n/lt.ts  src/i18n/format.ts
src/pwa/standalone.ts  persist.ts  updates.ts
src/db/types.ts  schema.ts  db.ts  seed.ts  repo.ts
src/logic/time.ts  names.ts  overlap.ts  layout.ts  backup.ts  drag.ts
src/ui/store.ts  hooks.ts  actions.ts  icons.tsx
src/ui/screens/Install.tsx  Calendar.tsx  Clients.tsx  ClientCard.tsx  Settings.tsx
src/ui/components/TabBar.tsx  Sheet.tsx  ActionSheet.tsx  Toast.tsx  WeekStrip.tsx
                  TimelineGrid.tsx  EntryBlock.tsx  MonthGrid.tsx  NewSheet.tsx
                  AppointmentSheet.tsx  DragGhost.tsx  Sheets.tsx
tests/unit/*.test.ts   tests/e2e/*.spec.ts
../.github/workflows/ci.yml  deploy.yml
```
