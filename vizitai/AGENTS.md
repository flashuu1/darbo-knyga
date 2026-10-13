# AGENTS.md – Vizitai

Instructions for coding agents working in this repo. The product spec is `docs/architecture.md`. It is the source of truth: when this file and the spec disagree, the spec wins.

## What this is

A Lithuanian-language Home Screen web app (PWA) for iPhone that replaces a hairdresser's paper appointment book. It is served as static files from GitHub Pages, and all data stays in IndexedDB on the phone. One user, one device, no backend.

## Non-negotiables

1. **Lithuanian only.** Every visible string comes from `src/i18n/lt.ts`, with no inline UI literals. Dates come only from `Intl.DateTimeFormat('lt-LT')`, plurals only from `Intl.PluralRules('lt')`.
2. **No network at runtime.** No backend, no analytics, no CDN fonts or scripts. Everything is bundled.
3. **The client name is the only free-text input when booking.** Service, date and time are picked, never typed.
4. **Only the start time is stored.** `start` is a local wall-clock string `YYYY-MM-DDTHH:mm` and is never converted to UTC.
5. **Data is never lost.** Schema changes go only through Dexie version upgrades that migrate data. Never drop a store or table.
6. **Standalone only.** In a Safari tab the app shows the install screen and writes nothing.
7. **Undo is "Anuliuoti"; cancelling an appointment is "Atšaukti vizitą".** Plain "Atšaukti" only dismisses a sheet.

## Repo layout

```
src/
  i18n/lt.ts        all UI strings (table in docs/architecture.md)
  db/               Dexie schema, versions, migrations, seed services
  logic/            client match/create, nameKey folding, overlap check, time helpers, backup
  ui/screens/       Day, Week, Month, Clients, ClientCard, Settings, Install
  ui/components/    sheets, action sheet, toast, chips, week strip, timeline entry
tests/
  unit/             Vitest: logic and db
  e2e/              Playwright: WebKit, iPhone device profile
docs/
  architecture.md   the spec
```

## Build order

Each milestone is one PR. A milestone is done when its checks pass.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Scaffold: Vite + TypeScript + Preact, vite-plugin-pwa, manifest, icons, GitHub Actions deploy to Pages, standalone detection and install screen | Opens from the iPhone Home Screen and loads in airplane mode |
| M1 | Data layer: Dexie schema v1, seeded services, `nameKey` folding, client match-or-create, overlap check, export/import JSON | Unit tests pass for data model rules 1–5, the DST case and the export/import round trip |
| M2 | Calendar: Day view with week strip, Week view, Month view, swipe between days, "Šiandien" | Entries render at the correct times, and empty rows are tappable |
| M3 | Add flow: new appointment sheet with prefill rules, recent clients, autocomplete, service chips, native time wheels, overlap warning | Booking from an empty slot takes 3 taps plus typing the name |
| M4 | Appointment sheet: open, change service, "Perkelti", "Neatvyko", "Atšaukti vizitą" with optional reason, "Atkurti vizitą", undo toast | Cancel and undo e2e tests pass, and the freed slot is bookable |
| M5 | Long-press drag: 400 ms hold, 8 px scroll threshold, 15-minute snap, cross-day drop in Week view and on the week strip, edge flip, `moves` history | Drag and scroll e2e tests pass, and long-press never opens the iOS text callout |
| M6 | Clients: list with `Intl.Collator('lt')` sort, search, client card, "Registruoti" | Search and sort tests pass |
| M7 | Settings: services editor, working hours, backup export and import, storage persistence status | The export/clear/import round trip works on the device |
| M8 | Suggestions 1–3: backup reminder, one-tap rebooking, smart defaults | Covered by e2e tests |
| M9 | Suggestions 4–7, after the first round of testing with the user | Agreed with the owner first |

## Working rules

- Read `docs/architecture.md` before starting a milestone. Don't make a decision that the spec lists under "Open decisions". Use the default it gives and leave a note in the PR.
- If an implementation has to depart from the spec, update the spec in the same PR and say why in the PR description.
- Tests: Vitest for `logic/` and `db/`, Playwright (WebKit, iPhone device profile) for flows. Every acceptance item in the spec maps to at least one test or to a named manual check.
- Before merging: type-check, lint and all tests pass, and the build contains no English UI strings outside `lt.ts`.
- Don't add dependencies beyond the stack in the spec without stating the reason in the PR.
