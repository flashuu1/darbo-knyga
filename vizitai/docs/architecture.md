# Kirpėjos užrašų knygelė – App Spec

Spec date: 2026-10-13 · Owner: Tomas

## Purpose and hard constraints

A Lithuanian-language Home Screen web app replaces a hairdresser's paper appointment book. All data stays on her iPhone. One user, one device, no backend.

| Constraint | Rule |
| --- | --- |
| Language | Every visible string is Lithuanian (lt-LT): labels, dates, weekdays, toasts, errors, empty states. 24-hour time. Week starts Monday. |
| Platform | Home Screen web app on iPhone, opened from its icon in standalone mode. No App Store, no Apple Developer account. |
| Hosting | Static files on GitHub Pages. GitHub serves code only and never receives data. |
| Data | IndexedDB on the phone. No server, no analytics, no third-party requests at runtime (no CDN fonts or scripts). |
| Typing | The client name is the only free-text input when booking. Service, date and time are picked. |
| Time | Only the start time is recorded and shown. The user never enters or sees an end time. |
| Speed | A new booking takes at most 3 taps plus typing the name. |
| Look | Feels like a native iOS app (see [iOS look and feel](#ios-look-and-feel)). |

## Platform, hosting and storage

A static PWA built from a GitHub repo and served by GitHub Pages. After the first load a service worker serves the code from cache, and all reads and writes go to IndexedDB on the phone.

```mermaid
flowchart LR
  GH["GitHub Pages<br/>static HTML, JS, CSS<br/>code only, no data"]
  BK["Backup JSON file<br/>via the iOS share sheet<br/>to Files or iCloud Drive"]
  subgraph Phone["Her iPhone · Home Screen app"]
    SW["Service worker cache<br/>app code, works in airplane mode"]
    UI["App UI (Preact)<br/>calendar, clients, settings"]
    DB["IndexedDB (Dexie)<br/>clients, appointments, services, settings"]
  end
  GH -- "code on first launch and on updates" --> SW
  SW -- "serves the app offline" --> UI
  UI <-- "every read and write" --> DB
  UI <-- "export and import" --> BK
```

GitHub delivers only code. The backup file is the only copy of the data that ever exists off the phone. Nothing flows back to GitHub.

| Component | Choice | Reason |
| --- | --- | --- |
| Build | Vite + TypeScript | Static output that Pages can serve |
| UI | Preact | Small bundle, plain component model |
| Storage | Dexie.js over IndexedDB | Versioned schema with upgrade functions |
| Offline | vite-plugin-pwa (Workbox precache) | App opens in airplane mode |
| Dates | Native `Intl` with `lt-LT` | Lithuanian weekdays and months with no date library |
| Deploy | GitHub Actions to Pages on push to `main` | One-step release |

Rules:

- **Fixed origin and path.** The app lives at `https://flashuu1.github.io/darbo-knyga/` (GitHub Pages project site, repo `flashuu1/darbo-knyga`). The origin `https://flashuu1.github.io` and the path `/darbo-knyga/` are permanent: storage is tied to the origin, so moving the app, renaming the repo or changing the path strands her data. Storage is per origin, not per path, so any other site on the `flashuu1` account shares this origin: the IndexedDB database name must stay unique (the app uses `vizitai`) and no other site may touch it. The production build uses `base: '/darbo-knyga/'` (`site.config.json`, the single source of truth; `scripts/scan-bundle.mjs` fails if `dist/` disagrees); the manifest `start_url`/`scope`, service-worker scope and precache URLs all derive from it. Dev and the e2e build use `/`.
- **Standalone only.** If the app is opened in a Safari tab, it shows only the install screen and never writes data. The Home Screen app's storage is treated as separate from Safari's.
- **Persistence.** Call `navigator.storage.persist()` on the first standalone launch and show the result in Settings.
- **Local wall-clock times.** Store `start` as `YYYY-MM-DDTHH:mm` local time and never convert it to UTC. The DST change on 2026-10-25 must not shift any appointment.
- **Schema changes.** Only through Dexie version upgrades that migrate the data. Never drop a store.
- **Updates.** A new code version activates on the next launch, never while a sheet is open.
- **Backup.** Export all data as one JSON file that includes `schemaVersion`. Share it through the iOS share sheet (`navigator.share` with a file) to Files or iCloud Drive. Import restores it from a file picker.
- **Out of scope:** reminder notifications (need a push server), access to iOS Contacts or Calendar, haptics (iOS Safari has no Vibration API).

## Data model

The app stores four record types. Clients are created automatically from the typed name, so a separate contact form is never needed.

**`clients`**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (UUID) | Primary key |
| `name` | string | As typed, trimmed, single spaces |
| `nameKey` | string, indexed | Lowercase with diacritics removed (`NFD`, strip marks): "Žydrūnė" becomes "zydrune" |
| `phone` | string, optional | Added later from the client card, never during booking |
| `createdAt`, `updatedAt` | ISO timestamp | |

**`appointments`**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (UUID) | Primary key |
| `kind` | `client` \| `personal` | Personal = her own appointments |
| `clientId` | string, nullable, indexed | Null when `kind = personal` |
| `title` | string, nullable | Typed text for personal entries only |
| `serviceId` | string, nullable | Null when `kind = personal` |
| `start` | string `YYYY-MM-DDTHH:mm`, indexed | Local wall-clock time, any minute (the time wheels are not limited to a grid) |
| `status` | `booked` \| `cancelled` \| `noshow` | "Done" is derived: `booked` with a start in the past |
| `cancelReason` | string, nullable | Always null for new cancellations (no reason is asked); kept for older data |
| `cancelledAt` | ISO timestamp, nullable | |
| `amountCents` | integer, optional | What she took for the visit, in euro cents. Absent or null = not entered yet. Unindexed, so no schema version bump |
| `moves` | array of `{at, from, to}` | Reschedule history, appended on every move |
| `createdAt`, `updatedAt` | ISO timestamp | |

**`services`**: `id`, `name`, `color` (iOS system colour name), `minutes` (hidden default length), `order`, `active`. Removing a service sets `active = false` so old appointments keep their label.

**`settings`** (one record): `dayStart` (08:00), `dayEnd` (20:00), `slotMinutes` (15), `lastBackupAt`, `persistGranted`.

Logic rules:

1. On save, look up the typed name by `nameKey`. If it matches, link the existing client; if not, create a new client.
2. The service's `minutes` is used only to size the block in the calendar and to detect overlaps. It never appears in a booking form (it is edited only in Settings).
3. An overlap means another `booked` appointment whose `[start, start + minutes)` intersects the new one. Overlaps warn but never block the save.
4. Search compares `nameKey` with the folded query. `localeCompare` cannot be used here: under `lt` rules "Z" and "Ž" are different letters.
5. Client lists sort with `Intl.Collator('lt')`.

## Screens and navigation

The app opens on today's day view. A bottom tab bar has three tabs: Kalendorius, Klientai, Nustatymai.

| Screen | Contents | Main gestures |
| --- | --- | --- |
| Calendar – Day (default) | Large title with the date ("spalio 14 d., trečiadienis"). Week strip of 7 day chips, with a dot on days that have bookings. Vertical timeline from `dayStart` to `dayEnd` with 15-minute rows. Each entry shows start time, client name and service, coloured by service. | Swipe left or right to change day. Tap an empty row to book there. Tap an entry to open it. Long-press an entry to move it. "Šiandien" button jumps to today. |
| Calendar – Week | Segmented control "Diena \| Savaitė". Seven columns with compact entries (time + name). | Same as Day. Dragging an entry across columns changes its date. |
| Calendar – Month | Opened by tapping the month name. Month grid with a booking count per day. | Tap a day to open its Day view. |
| Appointment sheet | Bottom sheet: name, service, date and time, status, actions. | See [Open, reschedule and cancel](#open-reschedule-and-cancel). |
| New appointment sheet | Bottom sheet, see [Add appointment flow](#add-appointment-flow). | Opened by "+" in the nav bar or by tapping an empty row. |
| Clients | Search field and alphabetical list (`Intl.Collator('lt')`) with the last visit date under each name. | Tap a client to open the card. |
| Client card | Name (editable), optional phone, upcoming visits, past visits, visit count, cancellation and no-show count. "Registruoti" button. | "Registruoti" opens the new appointment sheet with the client filled in. |
| Settings | Services (add, rename, reorder, colour, length in minutes, hide), working hours, backup export and import, storage status, app version. | |
| Install screen | Shown only when the app is opened in a Safari tab: steps to add it to the Home Screen. | |

## Add appointment flow

A full-height modal with three screens that slide (no layout shift when the keyboard opens: the name field is at the top and only the first screen has a keyboard). Swipe down on its header, or "Atšaukti", closes it.

1. **Klientas.** Segmented control "Klientas | Asmeninis". Autofocused name field (the keyboard opens inside the tap that opened the modal) with the 3 most recent clients while it is empty and diacritic-insensitive matches while typing (max 3). Return ("Toliau") or tapping a client moves on; Enter never saves. Asmeninis: a title field, then straight to Laikas.
2. **Paslauga.** Large service cards (service colour, check mark when selected; default = the client's last active service, otherwise the first), a "Laikas" summary row and "Išsaugoti". No keyboard.
3. **Laikas.** An in-app month calendar (Monday first, dots on days with bookings, swipe or arrows between months) above two scrolling time wheels (hours, minutes; every minute 00–59 can be picked, tapping a number works too). The picked time is stored exactly as picked. It is used everywhere a time is chosen, including "Perkelti".

A new booking from an empty slot takes 3 taps plus typing the name: tap the slot, (type the name, return), tap a service card, tap "Išsaugoti". The first "Išsaugoti" tap on an overlapping time shows "Šiuo laiku jau užregistruota: {vardas} – {paslauga}", the second saves. Every service and personal entry is 15 minutes long by default.

"Užregistruoti į priekį" (appointment sheet and client card) opens the same modal directly on Laikas for the same client and service, with tomorrow at the visit's time of day preselected; there are no 4/6/8-week shortcuts.

## Amounts

When a client visit's start time has passed and no amount is entered, its calendar entry turns orange with "Pridėti sumą". Tapping it opens the "Suma" dialog (number keyboard, euros, comma or dot); "Patvirtinti" stores `amountCents` and the entry then shows e.g. "45,00 €". The amount can be changed or cleared from the appointment sheet (clearing makes the entry orange again). Cancelled, no-show and personal entries never ask for an amount. Reports and totals come later.

## Open, reschedule and cancel

Tap opens an entry. Long-press moves it. Cancel takes two taps and one confirmation; no reason is asked.

**Open (tap).** The appointment sheet shows the name (tapping it opens the client card), the service chips (tapping one changes the service immediately), the date and time, and the status. Actions, top to bottom:

- "Perkelti": opens the date and time wheels, saves when they close.
- "Neatvyko": shown only after the start time has passed. Sets `status = noshow`.
- "Atšaukti vizitą": red, destructive.
- "Atkurti vizitą": shown instead of the two actions above when the entry is cancelled or a no-show.

**Reschedule (long-press and drag):**

1. Hold an entry for 400 ms without moving. The entry lifts (scale 1.03 + shadow) and scrolling locks. Moving more than 8 px before 400 ms is treated as a scroll, not a drag.
2. Drag in any direction: the lifted entry follows the finger and a live label shows the new time (dropped on whole 5 minutes). The day under the finger is highlighted.
3. To change the date in Week view, drag across columns. In Day view, drop on a chip in the week strip (it keeps the time), hold at the left or right screen edge (about 0.4 s, then one day every half second) to flip the day, or hold over the first or last day of the week strip to page to the next or previous week, so any date can be reached.
4. Release to save immediately, append to `moves`, and show the toast "Perkelta: spalio 15 d., kt · 14:00" with "Anuliuoti" for 5 s.
5. Dropping onto an overlap is allowed; the toast adds the overlap warning.
6. While dragging, holding within 40 px of the top or bottom edge of the timeline scrolls it.

**Cancel:**

1. Tap "Atšaukti vizitą".
2. An iOS action sheet titled "Atšaukti vizitą?" offers "Atšaukti vizitą" (red) and "Palikti" (keep). No reason is asked.
3. Set `status = cancelled` with `cancelReason` and `cancelledAt`. Show the toast "Vizitas atšauktas" with "Anuliuoti".
4. The slot is free right away. In the timeline the cancelled entry shrinks to a thin, faded, struck-through line; the rest of its row still books a new visit. Tapping the line offers "Atnaujinti vizitą" (bring it back as it was) or "Pakeisti nauju vizitu" (book something new in its place; the cancelled entry is then removed). Cancelled entries are removed for good after 7 days (checked at launch and whenever the app returns to the front).

Wording: "Atšaukti" means both "cancel" and "undo" in Lithuanian. Undo is always "Anuliuoti" (the iOS term), and cancelling an appointment is always "Atšaukti vizitą", never plain "Atšaukti".

## iOS look and feel

The app copies iOS system patterns rather than inventing its own: large-title nav bar, bottom tab bar, bottom sheets with a grabber, action sheets for destructive choices.

| Area | Rule |
| --- | --- |
| Font | `font: -apple-system-body` on the root, so the app follows her iPhone text-size setting. Sizes in `rem`, never fixed `px` for text. |
| Colour | iOS system palette, light and dark through `prefers-color-scheme`. Each service has one colour, used as the entry's left bar and tint. |
| Shell | Manifest `display: standalone`. `viewport-fit=cover` and `env(safe-area-inset-*)` padding. 180×180 `apple-touch-icon`. `theme-color` and the status-bar style meta tag. |
| Touch | Targets at least 44 × 44 pt. `-webkit-touch-callout: none` and `user-select: none` on the whole document (only inputs and textareas are selectable), so a press and hold never highlights text or opens the callout anywhere in the app. `overscroll-behavior: none`. No double-tap zoom. |
| Inputs | Font size at least 16 px so iOS does not zoom on focus. Dates and times are chosen in the app's own calendar and time wheels (no native date/time inputs). Working hours use `<input type="time">`, snapped to 15 minutes in code because iOS ignores `step`. |
| Motion | Sheet and push transitions 250–350 ms. Disabled under `prefers-reduced-motion`. |
| Feedback | No haptics are available, so every action shows a visual state change and a toast. |
| Empty states | Plain Lithuanian sentences, for example "Šią dieną vizitų nėra", with one obvious next action. |

## Lithuanian UI strings

All strings live in one file (`src/i18n/lt.ts`), and the UI never uses inline literals. Dates and weekdays are formatted only with `Intl.DateTimeFormat('lt-LT')`, which gives "spalio 14 d., trečiadienis" and the short forms pr, an, tr, kt, pn, št, sk. Counted nouns use `Intl.PluralRules('lt')` (categories one, few, many, other), or a label that avoids the plural, such as "Vizitų skaičius: 5".

| Key | Lithuanian | Where |
| --- | --- | --- |
| `tab.calendar` | Kalendorius | Tab bar |
| `tab.clients` | Klientai | Tab bar |
| `tab.settings` | Nustatymai | Tab bar |
| `view.day` / `view.week` / `view.month` | Diena / Savaitė / Mėnuo | Calendar view switch |
| `nav.today` | Šiandien | Calendar nav bar |
| `sheet.new.title` | Naujas vizitas | New appointment sheet |
| `type.client` / `type.personal` | Klientas / Asmeninis | Type segment |
| `field.name` | Kliento vardas | Name placeholder |
| `field.title` | Pavadinimas | Personal entry placeholder |
| `field.service` | Paslauga | Section label |
| `field.time` | Laikas | Section label |
| `btn.save` | Išsaugoti | Sheet nav bar |
| `btn.dismiss` | Atšaukti | Sheet nav bar (closes without saving) |
| `btn.close` | Uždaryti | Appointment sheet |
| `act.move` | Perkelti | Appointment sheet |
| `act.noshow` | Neatvyko | Appointment sheet |
| `act.cancelAppt` | Atšaukti vizitą | Appointment sheet, destructive |
| `act.restore` | Atkurti vizitą | Cancelled or no-show entry |
| `cancel.question` | Atšaukti vizitą? | Action sheet title |
| `cancel.keep` | Palikti | Action sheet |
| `status.booked` | Užregistruota | Status label |
| `status.done` | Įvyko | Derived status label |
| `status.cancelled` | Atšaukta | Status label |
| `status.noshow` | Neatvyko | Status label |
| `toast.moved` | Perkelta: {data} · {laikas} | After a move |
| `toast.cancelled` | Vizitas atšauktas | After a cancel |
| `toast.undo` | Anuliuoti | Toast button |
| `warn.overlap` | Šiuo laiku jau užregistruota: {vardas} – {paslauga} | Save or drop over a booking |
| `empty.day` | Šią dieną vizitų nėra | Empty day |
| `clients.search` | Ieškoti | Clients search field |
| `client.upcoming` | Būsimi vizitai | Client card |
| `client.past` | Ankstesni vizitai | Client card |
| `client.book` | Registruoti | Client card button |
| `client.phone` | Telefonas | Client card |
| `settings.services` | Paslaugos | Settings |
| `settings.hours` | Darbo laikas | Settings |
| `settings.backup` | Atsarginė kopija | Settings section |
| `backup.export` | Eksportuoti duomenis | Settings |
| `backup.import` | Atkurti iš failo | Settings |
| `storage.persistent` | Duomenys apsaugoti nuo išvalymo | Settings, persist granted |
| `storage.notPersistent` | Duomenys gali būti išvalyti – sukurkite atsarginę kopiją | Settings, persist denied |
| `install.title` | Įdiekite programėlę pagrindiniame ekrane | Install screen |

Default services, all editable in Settings: Kirpimas, Dažymas, Kirpimas ir dažymas, Sruogelės, Šukuosena, Kita. The install screen's step text must quote the Share-menu label exactly as it reads on her iPhone, checked on the device.

## Suggestions

Seven additions ranked by value. Numbers 1–3 belong in the first testable version; the rest can follow.

| # | Suggestion | What it does | Why |
| --- | --- | --- | --- |
| 1 | Backup reminder | If `lastBackupAt` is older than 7 days, Settings shows a badge and the day view shows a one-line banner "Sukurti atsarginę kopiją?" that opens the share sheet. | Phone storage is the only copy. This is the cheapest protection against eviction, a lost phone or a wiped app. |
| 2 | One-tap rebooking | A "Kartoti" action on an appointment and on the client card, with chips "po 4 sav.", "po 6 sav.", "po 8 sav.". It opens the new sheet with the same client and service at that interval. | Hair clients come back on a cycle, so the next booking is usually made in the chair. (Now "Užregistruoti į priekį": opens the calendar picker, no fixed 4/6/8-week chips.) |
| 3 | Smart defaults | The client's last service is preselected, the next free slot is suggested, and recent clients appear before typing. | Shrinks most bookings to a tap on a name and "Išsaugoti". |
| 4 | Free-slot highlight | Gaps between bookings are tinted in the day view. A slot freed by a cancellation pulses briefly. | She can answer "when do you have time?" on the phone at a glance. |
| 5 | Phone, call and SMS | An optional phone number on the client card, with `tel:` and `sms:` buttons. Never asked during booking. | One tap to confirm a booking or offer a freed slot. |
| 6 | Reliability marker | The client card and the name suggestions show cancellation and no-show counts, for example "Atšaukė: 3". | Helps her decide who to double-check before holding a prime slot. |
| 7 | Paper-book import | A one-time CSV import (`data,laikas,vardas,paslauga`) in Settings, so the future bookings already in the paper book can be loaded on day one. | Going live without retyping weeks of bookings on the phone. |

## Open decisions

These need an answer before the build starts. The spec uses the default shown until each is decided.

| Decision | Default in this spec |
| --- | --- |
| App name on the Home Screen | "Vizitai" |
| Final service list and the hidden length of each | The 6 defaults above, 30–120 min |
| Working hours shown in the day view | 08:00–20:00, 15-minute grid |
| Origin | Decided by the owner: `https://flashuu1.github.io`, fixed path `/darbo-knyga/` (project site). Never change either; other sites on this account share the origin, so keep IndexedDB names unique (`vizitai`) |
| Her iPhone's iOS version and system language | iOS 26, Lithuanian, so the native date wheels are also in Lithuanian |
| Cancelled entries in the timeline | A thin, faded, struck-through line |
| Overlapping bookings | Warn and allow |

## Acceptance criteria and test plan

The first testable build is accepted when every item below passes on a real iPhone running the app from its Home Screen icon. Automated checks run in Playwright with the WebKit engine and iPhone device emulation. The on-device checks are done by hand.

Automated (Playwright, WebKit, iPhone viewport):

- [ ] Booking from an empty slot takes 3 taps plus typing the name.
- [ ] Searching "zydrune" finds "Žydrūnė", and typing an existing name links that client instead of creating a duplicate.
- [ ] The client list sorts with `Intl.Collator('lt')`.
- [ ] A long-press drag follows the finger freely, drops on whole 5 minutes, changes the date in Week view and via the week strip, and is undone by "Anuliuoti".
- [ ] A quick swipe under 400 ms scrolls the timeline and never starts a drag.
- [ ] Cancelling takes one confirmation (no reason), the freed slot accepts a new booking, and "Anuliuoti" restores the original.
- [ ] An appointment at 10:00 on 2026-10-25 (the DST change) still shows 10:00.
- [ ] Export, clear the data, then import gives identical record counts and contents.
- [ ] A schema version bump with seeded data loses no records.
- [ ] A scan of the built bundle finds no visible English strings outside `lt.ts`.

On the device (by hand):

- [ ] Installs to the Home Screen and opens full-screen, respecting safe areas, in both light and dark mode.
- [ ] Opens and works in airplane mode after the first launch.
- [ ] Data survives closing the app, restarting the phone, and deploying a new code version.
- [ ] Settings shows the result of the storage persistence request.
- [ ] Remains usable at the largest iOS text size.
- [ ] Long-press never opens the iOS text callout or the magnifier.


## Contacts (Klientai) and payments

The list is ordered by what needs her attention:
1. **Waiting for an amount** (orange "Pridėti sumą"): clients with a visit whose time has passed and no amount yet, the longest-waiting first.
2. **Paid this month** (green "✓ Sumokėta 45,00 €"): the sum of the amounts entered for visits in the current month. It shows until the end of the month; on the 1st the row falls back to the next visit, or nothing.
3. **Coming visit** ("Kitas vizitas: …"), soonest first.
4. Everybody else, A–Z with Lithuanian rules.
A client can show several of these at once (for example paid and a next visit). In the calendar, an entry with an amount is green with "✓ 45,00 €"; one waiting for an amount is orange.

## Name suggestions

While typing a name (from the first letters; "contains" matches from 2 letters) the suggestions are ranked: names starting with the text, then names where a later word starts with it, then names containing it; inside each rank, the client she books most, then the most recent. At most 5 are shown.

## Service lengths

Every service defaults to 15 minutes; the length is edited per service in Nustatymai → Paslaugos and is remembered. A one-time migration (schema v2) turned the old built-in lengths (45/90/120/120/60/30) into 15; lengths she set herself are kept.

## Swipes, zoom and deleting

- **Delete by swiping.** In Klientai and in Nustatymai → Paslaugos, swiping a row to the left reveals a red trash button. A client is deleted after a confirmation, together with their visits (the toast offers "Anuliuoti"). A service that visits still use is only hidden (their labels must not vanish); the last active service cannot be deleted.
- **Cancelled visits in Klientai.** Cancelled visits that have not yet been removed (7 days) are listed under "Atšaukti vizitai" at the bottom; tapping one offers "Atnaujinti vizitą", "Pakeisti nauju vizitu" or "Ištrinti visam laikui".
- **Status.** A visit reads "Laukiama" while it is ahead, "Nepatvirtinta" once its time has passed without an amount, "Įvyko" once the amount is in; cancelled and no-show are "Atšaukta" / "Neatvyko".
- **Main button of the booking flow** ("Toliau" / "Išsaugoti") is at the bottom of every screen and rides up above the keyboard while it is open.
- **Sheets** (visit, move) close by swiping down from anywhere on them while their content is not scrolled, or from the handle.
- **Zoom.** Two fingers on the timeline (Diena and Savaitė): like a map: fingers apart make the hours bigger, fingers together show more of the day; the zoom is remembered and the time between the fingers stays put. Zoomed far out, a whole working day fits on one screen, and only every 2nd, 3rd (or more) hour gets a label and a line, with the half-hour and quarter lines dropped first. Switching Diena and Savaitė keeps the same hours in view and slides the grid over.
- **Motion.** Swiping sideways on the timeline slides the day/week with the finger and glides to the next one; switching Diena/Savaitė/Mėnuo eases the new view in; the empty-day message fades out by itself and as soon as the calendar is scrolled.

## Personal entries, expenses and the balance

- **Her own choices (Nustatymai).** Two lists, edited like Paslaugos: "Asmeniniai" (the kinds of personal entry, e.g. Pietūs, Pertrauka, Gydytojas) and "Išlaidų rūšys" (the kinds of expense, e.g. Medžiagos, Nuoma, Mokesčiai). Edited in rows (see "Rows that open in place"): rename, add, move, delete (with Anuliuoti). Stored in the `options` store (`id, group, order`; schema v3). They start empty: there are no templates, she creates them herself (schema v4 removed the examples v3 first shipped with). Part of the backup file; an older file without them has none. Entries keep the name they were made with, so deleting a choice never changes them.
- **New entry.** The first screen has three types: Klientas, Asmeninis, Išlaida. Asmeninis and Išlaida show her list to pick from (no typing); Išlaida also asks for the amount. Then Laikas, then save. An expense is an entry of kind `expense` (title = the choice, `amountCents` = money out), shown in the calendar in red as "−12,50 €", opened and moved like any entry, and its amount can be changed. It never raises an overlap warning.
- **Balance.** Shown under the title on every calendar view: money in (amounts of visits) minus money out (expenses), all time, with "Gauta" and "Išlaidos" beside it. Cancelled and no-show entries do not count. It can go negative (red). Budgeting and reports come later.
- **Name suggestions with the keyboard up.** The first screen shrinks to the part above the keyboard and the main button, so every suggestion that fits is visible and the list scrolls on its own; dragging the list puts the keyboard away. Up to 8 suggestions.
- **An expense is not a visit.** Its sheet shows only the amount (change), Perkelti (date and time) and Ištrinti išlaidą (with Anuliuoti); no status, cancel, no-show or restore. It is red, never the green of a paid visit.
- **Išlaidos tab** (fourth tab): one month at a time (arrows), that month's money in, expenses and balance, the expenses per kind, and every expense entered, newest first; a tap opens it.

## Performance rules

- **Scrolling never waits for JavaScript.** Touch listeners on scrolling areas are passive. The one exception is the two-finger zoom of the timeline: its non-passive `touchmove` listener exists only while two fingers are down. The timeline scroller has `touch-action: pan-y`.
- **Animate only `transform` and `opacity`** (compositor), never `top`, `bottom`, `height` or `width`. No `backdrop-filter` over scrolling content.
- **Do not re-render what did not change.** A live query that returns the same data keeps the previous value (no render). The 15-minute rows of a column are a memoised component. Entries and clients are read in one IndexedDB transaction.
- **The calendar stays mounted** behind the other tabs, so coming back is instant and keeps the scroll position and zoom. Each calendar column uses `contain: layout style`.

- **Suma sheet.** Opens the number pad (the hidden keyboard primer is switched to `inputmode=decimal` inside the tap), and its confirm button is a full-width bar at the bottom of the screen that rides above the keyboard, like the booking flow. The header keeps Atšaukti and the link to the visit.

## Product direction (the master picture; not a build list)

This is the direction every feature is measured against. Nothing in this section is built on request; it is what we keep getting closer to.

- **A personal assistant, not a notebook.** She does the work; the app keeps the books. Whatever she enters once is used everywhere after it: the calendar, the clients, the money, what needs doing next. Over time the app takes over more by itself (suggesting and eventually making bookings, reminding, noticing who is overdue), while entry stays manual until the client base is built up.
- **A tool she relies on, and her clients rely on.** It replaces the paper notebook completely, and becomes where a client's history, purpose, timing and payments live. Later it can show clients when she is free (see "calendar availability" below).
- **A minute at the end of the day.** She glances at it between clients and does the books at the end of the day. Booking takes at most a minute; everything that can be worked out must already be worked out when she opens it, so the numbers are accurate without her chasing them: what is waiting for an amount, who should be booked again, what the day brought in and cost.
- **Insights over time.** With many clients and years of entries it must answer questions (who is regular, who has gone quiet, what earns, what costs, how the months compare). That needs queue, filtering and smart indexing, which we revisit once the data is there.
- **Rules that follow from it:** never make her enter the same thing twice; prefer defaults and one-tap choices to typing; anything waiting for her attention is visible at a glance (orange glow, pills in Klientai); every flow keeps its main action in the thumb zone; performance and smoothness are a prerequisite for every feature.
- **Possible later steps** (hypothetical): public availability, self-booking with her approval, automatic suggestions for rebooking. These need a backend, which would change the "no network, one device" rule and the privacy position; decide together before building.

## Orange glow and settling up

- A visit whose time has passed and that has no amount yet glows orange (a soft pulsing ring with two small sparks) in Diena and Savaitė; it stops the moment the amount is in. Only opacity and transform animate. Reduced-motion users get a still ring.
- In Klientai the orange "Pridėti sumą" pill opens Suma for that client's longest-waiting past visit directly, without opening the client card.
- The first amount of a client visit is followed by "Užregistruoti dar kartą?" in the same sheet: the blue "Taip, užregistruoti" button sits where "Patvirtinti" was (the number pad stays up, so nothing moves), "Ne" closes with Anuliuoti available. Taip opens the date and time picker for the same client and service (tomorrow at the same time preselected), and saving shows that day in the calendar. Changing or clearing an existing amount asks nothing.

## Nustatymai layout

Nustatymai is a list of categories like iOS Settings, in three groups: Kalendorius (Paslaugos, Darbo laikas), Pasirinkimai (Asmeniniai, Išlaidų rūšys), Duomenys (Atsarginė kopija with a red dot when one is due, Apie programą with storage, version and build). Each row shows a coloured icon, its name and a short value, and opens its own page that slides in from the right, with a back button named Nustatymai, a large title, and a swipe to the right anywhere on the page to go back (the page follows the finger; see "The client card swipes back"). The build id also shows under the list.

## Išlaidos tab: positive first

Money in leads and money out is calm. The tab opens with the month's balance ("Liko šį mėnesį", green when positive, red only when the month is negative) and a legend with Gauta (green) and Išlaidos (indigo, never red). Below: a chart with one column per day, money in above the line and money out below it (colour is never the only cue), where a finger dragged across reads any day; "Kas sumokėjo", round dots with initials for the clients who paid this month, largest first (a tap opens the client); the expenses per kind as share bars; and every expense. Expense entries in the calendar are indigo/neutral for the same reason.

- **Motion budget.** Press 90 ms, fast 150 ms, medium 220 ms, sheets 320 ms; nothing longer than half a second. Animated properties are transform and opacity (colour fades only on small controls); a layer (`will-change`) exists only while something moves. With iOS Reduce Motion on, everything is reduced to ~1 ms. A page-level touch listener makes iOS show the pressed look (`:active`) at once. `tests/e2e/animations.spec.ts` watches every animation and transition during a tour of the app and fails on layout-forcing properties or anything over 500 ms.

## Entries, taps and settling up (overhaul)

- **The entry sheet** is laid out in blocks: who and when (avatar with initials, name linking to the client card, date · service · minutes, a status pill); the service chips; the money (a big orange "Pridėti sumą" button while the amount is missing, a green tick row with the amount and "Keisti sumą" once it is in); then the actions as full-width icon rows (Perkelti, Užregistruoti į priekį, Skambinti when the client has a phone number); and the risky ones in their own group below (Neatvyko, Atšaukti vizitą; an expense gets Ištrinti išlaidą).
- **A tap just beside an entry opens the entry.** A finger is bigger than a thin entry. A tap on an empty row that lands within 14 px sideways or 9 px above/below an entry opens that entry instead of booking a new one beside it (it re-uses the entry's own tap, so a due visit still raises the number pad). A tap farther away books as before.
- **Settling up in as few presses as possible.** Tap the entry (or the orange pill in Klientai), tap one of the amounts this client paid before (or type one), Patvirtinti, then the question. The amount is followed by a short confetti burst and a tick; "Ne" is a clearly outlined button next to the blue "Taip, užregistruoti".

- **What an entry shows depends on its own height**, not on the zoom of the whole calendar (`logic/fit.ts`, `data-fit` on the entry): the whole card from 54 px (40 px for a one-line entry); time and name on one line from 30 px; the name alone from 12 px; below that only the colour. A long visit therefore keeps its name when the calendar is zoomed out, in Diena and in Savaitė; a quarter of an hour at the smallest zoom is a sliver with no room for text.

## Vestuvės is a service (flowers)

Vestuvės is one of the services in Paslaugos (pink, 4 hours to start from, listed before Kita; schema v5 adds it once to an existing install). The flowers (`floral` on the service; Vestuvės has it, there is no switch for it in Nustatymai): visits of such a service get flowers drifting up from the entry while the visit is coming up and while it waits for its payment (on top of the orange glow once the time has passed), and none once the amount is in or the visit is cancelled. Service lengths go in quarter hours up to 2 hours and in half hours after that, up to 14 hours, so a wedding can be as long as it needs to be.

- **The glow and the flowers scale with the entry.** Both are layers exactly the size of the entry, and the ring, blur, sparks and flowers are sized from that layer's own height (container query units), so they follow the pinch live and are there at every zoom (a long visit gets big soft flowers, a quarter-hour sliver gets small ones). They are hidden only with Reduce Motion.

## Pakeitimų istorija (changelog)

Nustatymai > Apie programą ends with the changelog: what changed in each build, newest on top, in three kinds only: Klaidos taisymas (bugfix), Pakeitimas (change), Naujiena (feature). The newest entry is the build that is running: it is highlighted ("Ši versija"), roomy, and carries the build id shown above it. Older builds follow in a smaller, tighter list in a box that scrolls, each with its date and its own build id. Every build that is pushed gets an entry (date and items, no time); the rule and the routine are in AGENTS.md.

## Suvestinė: day, week and month

The calendar header carries one quiet button, "Dienos suvestinė" / "Savaitės suvestinė" / "Mėnesio suvestinė" according to the view (Diena, Savaitė, Mėnuo), with an orange badge for how many client visits anywhere still wait for their amount. It opens the books of what is on screen: the money (in, out, net) and a progress bar ("Sumokėta 2 iš 5"); the visits waiting for their amount, each with the amounts this client paid before as one-tap chips (a tap records the amount at once, with Anuliuoti) and "Kita suma" (opens Suma and returns to the page); when the period contains today also the earlier visits that never got an amount; the paid ones (a week or month lists the newest 30) each with "Užregistruoti dar kartą"; how many visits are still to come. Settling the last waiting visit shows "Viskas suvesta!" with confetti. A day is never a future day. The all-time balance is no longer shown on the calendar.

## Changing an amount

A confirmed amount that is changed leaves a line on the visit (`amountLog`: when, from, to), shown newest first as "Sumos pakeitimai" in the entry sheet; Anuliuoti removes the line with the change. Entering 0 (or nothing) on a visit that has an amount asks "Nunulinti sumą?" and explains that the visit becomes "Nepatvirtinta" and waits for its amount again; on agreeing the amount is removed (not stored as 0) and the log says it was nulled. 0 as a first amount is refused (nothing to reset).

## Asmeninis (overhaul)

- **Common words from the start** (hers to rename, add to or delete in Nustatymai > Asmeniniai): Psichologas, Psichiatras / psichiatrė, Neurologas / neurologė, Daktaras, Šeimos gydytojas, Dantistas, Akių gydytojas, Kineziterapeutas, Masažas, Pietūs, Autoservisas, Bankas (Pertrauka and Vaikų reikalai were taken out again; schema v7 removes them from an install that got them). A fresh install is seeded with them; schema v6 adds them once to an existing install (a word she already has is not doubled, her own stay first). Išlaidų rūšys still starts empty.
- **Half an hour by default**, and each choice has its own length (Nustatymai > Asmeniniai, quarter hours up to 2 hours, then half hours); a personal entry takes the length of its choice when it is made (`durationMinutes`). Entries made before this are half an hour too.
- **Its own colour**: vibrant red, in the calendar and in the entry sheet (grey meant "nothing").
- **The time wheels are loose.** Snapping stays, but nothing forces a stop at every number (`scroll-snap-stop: normal`), so a fling with speed carries on and settles by itself, and the number under the bar lights up while the wheel still turns.

- **The choices are cards, not rows** (Asmeninis and Išlaidos in the booking flow): two to a row, each with a picture on its own colour (guessed from the word by `logic/glyph.ts`: psichologas a brain, daktaras a stethoscope, dantistas a tooth, nuoma a house ...; a word it does not know gets its first letter on a colour that stays the same), a soft gradient of that colour, and a circle in the corner that fills in the card's colour with a ring around the card when it is picked.

## Dragging across weeks

In Savaitė, holding a lifted entry at the left or right edge of the screen (36 px) turns the calendar to the previous / next week (after 0.45 s, then every 0.8 s while she stays). While she holds there the edge glows with an arrow; when the week turns the new week slides in from that side and a pill says "Kita savaitė · spalio 19 – 25" (or "Ankstesnė savaitė"), and the strip of weekdays changes with it. The ghost stays in her hand and the drop lands in the week she is over (the weekday columns stay mounted when the week turns, with a hidden copy of the entry in its own weekday column, so the gesture survives). Diena does the same with days (edge zone 24 px).
- The pill names the week she lands on: "Ši savaitė" (this week, with its dates) when it is today's week, otherwise "Kita savaitė" or "Ankstesnė savaitė" by the direction she turned; Diena says "Šiandien" on today.

- **Asmeninis is red and glows.** Every personal entry (not a cancelled one) is the system red as a bold gradient with white type, a white bar on its left, and a red glow that keeps breathing with two small sparks drifting up, the same glow layer as the orange one for a payment that is due (it scales with the entry and with the pinch). Its sheet and its row in Nustatymai are red too.

## Nedirbu (off work) and the settings keyboard

- **Nedirbu** is a special wide card with a dashed outline at the bottom of the Asmeninis choices (it is not one of her editable choices). Picking it asks for the time **from** ("Nuo kada nedirbi": the date and time picker, with a Nuo → Iki header, then Toliau) and then the time **to** ("Iki kada nedirbi": a time wheel on the same day, starting an hour later, which must be later than the start; then Išsaugoti). The entry is a personal entry titled Nedirbu whose length is exactly from–to. A day off longer than one day is booked day by day.
- **Settings and the keyboard.** A settings page keeps room under its last row for the keyboard and scrolls a tapped field above it. A newly added choice or service gets the cursor at once, with its default name selected, so she can just type.

## Overlaps: a pop-up with details, not a second press

- Saving a new entry (or moving one with Perkelti) onto time that is already taken opens a pop-up: "Šiuo laiku jau yra įrašas · Persidengia su:", then one line per entry in the way (at most three): "Ona · Kirpimas · 14:00–14:30" (who or what, service, from when to when), with "Vis tiek išsaugoti" ("Vis tiek perkelti") and "Pakeisti laiką". Nothing is saved or moved before she agrees; "Pakeisti laiką" leaves her where she was. Back-to-back entries are not an overlap, and money out never is. This also applies to Nedirbu.
- **Dragging in the calendar never talks about overlaps**: the toast only says "Perkelta: ..." with Anuliuoti for a few seconds, as before.
- **Nedirbu is one screen with two steps**: the same picker, with a Nuo / Iki header in grey-blue (the entry in the calendar stays red). The chip being set glows faintly; "Toliau" moves the glow from Nuo to Iki on the same screen (the calendar is dimmed and locked, only the time wheel works, same day) and the button becomes "Išsaugoti".
- No choice card is red or pink (Daktaras is blue, Masažas purple), so red means Asmeninis only.

## Entries behind "+N" can be dragged

Press and hold the "+N" chip (what does not fit side by side) to lift the first of the hidden entries out of it: the card in her hand is that entry (name and time, a proper size, held by its middle), the chip counts one less (and disappears when none is left), and the entry can be dropped anywhere, turn the day or week at the edge, and be undone, like any other. A plain tap on the chip still opens the list of what is hidden. The chip's element stays mounted during the drag (a hidden anchor in the same keyed list), so the gesture survives a day or week turning.

## Klientai (list, filter) and Išlaidos > Analizė (designed in a mockup first)

**Klientai** is only about clients: a blue **+** (a client without a visit: name and optional phone), search, the filter button and the list below. It keeps its filter and sort while she visits another tab. The analysis lives in **Išlaidos**, which has a segmented control **Mėnuo | Analizė** (a white thumb slides between them) and keeps its page and period too.

**The Klientai list**
- **Search** by name (no diacritics) or by the digits of the phone (from three digits); the **filter button** (icon, with a red count of what is changed) opens "Filtruoti ir rūšiuoti": *Automatiškai* (everybody, in the app's own order), *Laukia sumos*, *Ateina šią savaitę* (a visit in the next 7 days), *Seniai nebuvo* (60+ days, nothing waiting), *Neseniai buvo* (14 days), each with its count; and sorting: Automatiškai / Pagal abėcėlę / Paskutinis vizitas / Daugiausiai išleidusios / Daugiausiai vizitų. No A–Ž side index.
- **Automatiškai = the order the app has always used** (`repo.listClients`): waiting for an amount first (longest waiting first), then clients whose amount she entered in the last 14 days (latest first), then those with a coming visit (soonest first), then everybody else A–Z. Cancelled visits stay at the bottom (only in that default view).
- **Four tiles** (Laukia sumos, Ateina šią savaitę, Seniai nebuvo, Neseniai buvo) show their count and filter the list below them in place (no other screen); pressing the active tile again, or "Rodyti visus", returns to Automatiškai.
- **A row says everything that applies and never hides one fact behind another**, in this order: (1) the money, as a pill on the right: orange *Laukia sumos* (an amount is waiting) or green *✓ 45 € · 10-31* (paid within 14 days); (2) when the client is next here (blue "Kitas: lapkričio 17 d."); (3) how the last time went (grey), shown whenever the green pill is not there to say it: "Paskutinį kartą: 115 € · prieš 3 sav." under a next visit, or "Buvo prieš 5 mėn. · 70 €" when nothing is booked, or "Buvo prieš 3 d." when its amount is missing. A visit that waits for its amount shows "Vizitas spalio 31 d." with the next visit on a second line. So a client who paid long ago and is coming again shows the next visit *and* the money of the last visit; one who paid lately shows the pill and the next visit. Under the money sorts the line is "Iš viso 640 € · vizitų: 7". Swipe left = delete (only).
- **The pills**: orange **Laukia sumos** (34 px tall, opens Suma straight from the list), green **✓ 45 € · 10-31** (the amount, cents only when there are some, and the day of the visit it was paid for as month-day: no month name and no year, since it is at most two weeks old and the year follows from today; the same size as the orange pill; lasts **14 days** after the visit, a tap edits the amount). Rows that have neither show a chevron. **Press and hold a row** (0.45 s; the row sinks slightly while held) floats a small card over a blurred list, like holding an app icon: the visit the row talks about (the one waiting for its amount, otherwise the next one, the one paid for, or the last one) at a glance. It is for looking, a card of its own and not the visit sheet: client, a status chip (Netrukus / Laukia sumos / Sumokėta / Neatvyko / Atšaukta), the day and the time from–to in large type with how far away it is, the service (colour, length), the amount when it is paid, the phone (tap to call) and how many visits the client has had. (The pills can be held too: the card opens and the hold does not count as a tap on the pill.) The card also shows the other side of the story in a framed block: for a visit that took place the **next visit** ("Kitas vizitas"), for a coming visit the **last visit** with its money ("Paskutinis vizitas · ✓ 115 €"), and an orange note when more visits still wait for their amount. A paid visit has **"Keisti sumą"** next to its amount (opens Suma with the amount in, to change it). Holding the pill opens the visit the pill is about; holding elsewhere on the row opens the most pressing one (waiting, then next, then paid, then last). A visit that took place and waits for its amount also shows the amounts this client paid before as orange chips (one tap saves, and the card turns into the paid one) and "Kita suma" (opens Suma); there are no service choices and no cancel, move or delete: the visit is changed in the calendar only, and "Rodyti kalendoriuje" goes to its day and highlights it. The card can be **flicked away in any direction** (it follows the finger, shrinks a little, and past about 90 px, or a quick flick, it is let go: it keeps the finger's speed and is pulled into the avatar or pill it came out of like on a spring, shrinking as it goes and fading only in the last moment; a flick away from the source is partly damped so it curves home); a tap outside or Escape does the same flight, and a short drag springs back, so the rows can be checked one after another. a tap on the row still opens the client, and moving the finger cancels the hold (so a swipe to delete is not disturbed).

**Analizė** (Išlaidos > Analizė) has four pages (Nauji, Dažniausi, Pelningiausi, Laikas) and one **period** for all of them: a grey bar of the 24 months with a window that is dragged, stretched by its edges or tapped to move, plus floating **"glass" buttons** (3 / 6 / 12 mėn. / Visi, blurred and translucent, kept above the tab bar; the thumb slides). The arrows ("↑ 12%") compare with the period of the same length right before it and are left out when there is none.
- **Nauji**: new clients per month (line + area), all clients over time, and how many of the new ones came back (what share reached their 1st, 2nd, 3rd … visit).
- **Dažniausi**: visits per month, **Kas kiek ateina** (the average gap between visits and clients who are past their own rhythm and have nothing booked: "kas 3 sav., jau 7 sav."; the groundwork for "Kas turėtų grįžti"), a weekday × time-of-day heat map, a ranking with a small trend line per client (a row opens its details).
- **Pelningiausi**: records (busiest month, most profitable month, best weekday), income per month, average per visit, **money lost** to no-shows and cancellations (approximate, at the usual amount; cancelled visits are kept only for a week, so mostly no-shows show up), a ring by service, a ranking by money.
- **Laikas**: hours worked (her whole working day on every day, minus Nedirbu; see below), hours off, days with visits, a worked-vs-off hours chart, earnings per worked hour.
- All the maths is `logic/analytics.ts` (pure, covered by unit tests); `repo.analyticsInput()` supplies plain records. Only past, kept visits count.

**Motion** (transform and opacity, nothing that forces layout; Reduce Motion makes everything jump): cards and rows rise in one after another; the segmented thumbs and the glass thumb slide; chart lines, areas, big numbers and ring slices *glide from what is on screen to the new data* (an SVG chart is drawn by `ui/components/charts.tsx` straight into attributes, so about 30 attributes change per frame and Preact is not involved); a touched chart reads out a month with a pin; heat-map cells change colour softly.

**Test data**: `tests/support/demo.ts` makes believable books (52 clients, two years, five visits waiting, some paid lately, bookings ahead, no-shows, days off, expenses). `DEMO_OUT=file.json npx vitest run tests/unit/demo-backup.test.ts` writes it as a backup file; Nustatymai > Atsarginė kopija > Atkurti iš failo loads it (replacing everything on that phone).

**Swiping between pages (Išlaidos).** A sideways swipe anywhere on the tab turns the page: the month, then Nauji, Dažniausi, Pelningiausi, Laikas, and back (nothing past either end; a page turn eats the click that would follow). Charts, the period bar, the glass buttons the month's day chart and rows with their own drags keep them, so a swipe that starts on one of those does not turn the page. The new page slides in from the side it came from (Reduce Motion: no slide). Pointer events with `touch-action: pan-y` on the tab's scroller, so vertical scrolling is untouched.

**Mėnesio rodikliai (Išlaidos > Mėnuo).** Under the month's money (which already shows what came in and went out, so it is not repeated) the same month has its own figures, following the month arrows: six tiles with an arrow against the month before (visits, new clients, average amount per visit, days with visits, hours worked, earnings per worked hour), the busiest day, the day with most money and the best weekday, the money by service as a ring, and the clients who paid most. A month without visits says so; months older than the 24 the analysis keeps show nothing. The figures come from `buildAnalytics` (per-month arrays, plus `days` per day of each month).

**How "working time" is counted (Analizė > Laikas, and the month tiles).** Every day she works counts with her whole working day from Nustatymai > Darbo laikas (08:00–20:00 = 12 h), **whatever the visits last**; under the hours there are seven weekday buttons (Pr ... Sk, all on to begin with, at least one stays on; `settings.workDays`, 0 = Monday) and a weekday that is switched off is no working time at all (a visit on it still counts as a visit): the length of a visit is not used anywhere in the figures. A "Nedirbu" entry (a few hours or a whole day) takes its time off that day, only the part that falls inside the working day, and two overlapping entries are not counted twice. Example: working day until 20:00, visits 10–15, Nedirbu 15–17, more visits until 19: 12 h minus 2 h = 10 h worked. Today counts only up to now, and months before her first entry (visit or Nedirbu) count as nothing. So: *Dirbta* = working day minus Nedirbu, *Nedirbu* = the time taken off, *Dienos su vizitais* = days with at least one visit, *Uždarbis už darbo valandą* = money / hours worked. There is no "share booked" figure, because it would need the visit lengths.

**The client card swipes back.** A swipe to the right that **starts in the left part of the card** (the left 28 % of its width, at least 80 px) drags the card away with the finger and returns to the list, like the "Atgal" button; a short or mostly vertical drag does nothing, and a swipe that starts anywhere else on the card does nothing. Pointer events with `touch-action: pan-y`. The same rule, in one hook (`ui/swipeBack.ts`), is used by the pages of Nustatymai: the page follows the finger from the first 14 px, a release past 110 px or a quick flick carries it out of the screen and then closes it (no second animation), otherwise it springs back; the tap that ends a drag is eaten.

## Low Power Mode (30 Hz)

Low Power Mode holds an iPhone's screen at 30 Hz, and Safari cannot say whether it is on. `ui/perf.ts` notices it by its effect: it times 45 animation frames about 1.5 s after launch, again at 4 s and then every 8 s while the app is in front (and when it comes back to the front). A clean 30 Hz (median gap 28–40 ms and an even beat) twice in a row switches the page to `html[data-fps="low"]`; 45 fps or better switches back at once; anything uneven or in between changes nothing, so a busy moment is never taken for Low Power Mode. At 60 or 120 Hz nothing is different.

In the low mode (end of `layers.css`, and `motionScale()` in code): the time tokens are shorter (press 70, fast 100, medium 160, sheet 230 ms) so every sheet, page and tab change is quicker and shows fewer in-between frames; the glass bar and the hold card's backdrop lose their blur (the dearest thing to draw each frame) for a plainer, more solid fill; entrances (cards, rows, the hold card) are shorter with less stagger; the numbers, charts and rings glide for 65 % of their time; the confetti has 14 pieces instead of 26; the orange and red glows keep breathing but without sparks, and flowers are three instead of five. Code that moves things frame by frame is written by time, not by frame count: the hold card's spring accepts a 33 ms step, and the drag's auto-scroll near the edge carries more per frame so it keeps its speed. Tests: `perf.test.ts` (the decision), and `animations.spec.ts` (the low mode marks the page, shortens the tokens and drops the blur; a simulated 30 Hz beat switches the app by itself; at normal speed it stays full). `/?fps=low` pins the mode in test builds only.

## Copies of the books (Nustatymai > Atsarginė kopija)

**What iOS allows.** A web app cannot write a file to Files or Atsisiuntimai by itself: a download or the share sheet needs a tap, and there is no background task, no File System Access API and no scheduled work on iOS. It also cannot read Atsisiuntimai: a file has to be picked through the file chooser. So the file itself always costs one tap ("Eksportuoti duomenis"), and a truly automatic copy off the phone needs a cloud copy (a backend; not built, see `todo.md`).

**What the app does instead.** It keeps copies of its own in a separate database (`vizitai-backups`, so replacing the books never touches them): the last **3 exports** (a copy of each file it handed to Files), **3 automatic copies** (one a day, taken the first time the app is in front that day when the books changed), and **1 safety copy** taken just before a restore or an import (so it can be undone). The page lists the exports newest first, with the date, time, clients, visits and size; tapping one asks "Atkurti duomenis iš šios kopijos?", restores it after keeping the safety copy, and the toast has "Anuliuoti". "Atkurti iš failo" is still there for a file that is not in the list. These copies share the phone's storage: if iOS clears the app's data they go too, which is why the exported file matters; the page says so.

**The page.** A status card on top (green with a check and "Duomenys išsaugoti" when the last export holds exactly the books, orange with "Verta sukurti naują kopiją" or "Kopijos dar nėra" otherwise, with the date of the last copy), "Eksportuoti duomenis" as the app's large blue button, "Atkurti iš failo" as a white one, then the copies as rows with a round icon (a green check on the one that matches the books), the date and time, the counts and size, and a small "Atkurti" or "Dabartinė" pill; the rows rise in one after another.

**Matching books.** Every copy has a fingerprint of what the books *are* (all records in a fixed order, ignoring the export time and what only describes this phone or this backup: `lastBackupAt`, `persistGranted`; `logic/snapshots.ts`). Consequences: exporting books that did not change since the last export asks "Duomenys nepakito nuo paskutinio eksporto ... Eksportuoti vis tiek?" and never makes a second copy of the same books; a copy or a file that holds exactly the current books answers "jau tokie patys: atkurti nereikia" instead of replacing anything; the copy that matches the books is marked "Dabartinė" (green check icon); an automatic copy is not made when any copy already holds the books; and the backup banner and badge do not appear while the books are exactly what the last export holds, however old that export is.


## Rows that open in place (Nustatymai > Paslaugos, Asmeniniai, Išlaidų rūšys)

One component, `ui/components/EditList.tsx`, for all three lists. Each item is **one full-width row**: Paslaugos shows a colour dot, the name and the length (tinted with the service's colour); Asmeniniai a grey clock and the length; Išlaidų rūšys an indigo wallet and the fixed amount ("450 €") or a grey "Be sumos". **A tap opens the row in place** (a chevron turns, the rows below glide down, the open row gets an outline in its colour); a tap on the same row or on another one folds it. Only one is open at a time. Inside: the name field; the length as a stepper (quarter hours up to two hours, half hours beyond; Paslaugos up to 14 h, Asmeniniai up to 12 h) and a row of chips (15 min ... 8 val, with the current value always among them); for Paslaugos the ten colours (44 pt targets, five a line) and a "Rodoma" switch (a hidden service is greyed in the list and is not offered when booking; the last visible one cannot be hidden); and nothing else: there are no arrows and no trash button in a row. **Order and removal are done by pressing and holding the row** (0.4 s; a finger that moves more than 8 px first is a scroll, not a hold): the row lifts (larger, with a shadow), follows the finger, the others make room, and the page scrolls by itself when the finger is near the top edge or just above the trash. The order is saved as dropped (`reorderServices`, `reorderOptions`; the booking screen uses the same order) and the dragged row is not opened by the tap that ends the drag. While a row is carried a **trash rises at the bottom** (a round button with only the trash icon, no words); when the finger is over it, it turns red and the row shrinks; let go and the row flies into it. **Nothing is asked**: the toast says "Ištrinta: Nuoma" and **Anuliuoti** brings the row back in its place. A service that has visits is only hidden (its row flies back, greyed and tagged "Paslėpta", with the toast saying so), and the last visible service cannot be removed (the row returns, the toast says why). Holding an open row folds it first. The page's own swipe back is off while a row is carried. **Add** is the **"+" at the top right of the page** (the round blue button the other screens have; it is drawn by the page, the list tells it what to add): it makes the item, opens its row and puts the cursor in its name with the name selected. The new row sits on the same data as before: nothing she already has is replaced, renamed or reordered by the redesign.

**How the rows move (no layout is animated).** Only the open row has its editor in the page, so a closed list is a handful of simple buttons. Every change of layout is played from the layout that was seen to the one that is there now, with transforms only (the FLIP way, `EditList.tsx`): the layout changes at once, and each row is animated with `translateY` from where it was drawn to where it is, the row that grew is uncovered with a `clip-path` (paint only), and the new editor fades in (opacity and a few pixels of `translateY`). A row folding runs the other way before the page changes (the row is clipped shorter, the rows below move up, the editor fades), so there is no jump at the end. Rows added, moved or deleted glide the same way from their old places. The page is scrolled (at once, inside the same glide) so that an opened row, or the field that is about to get the number pad, is above where the keyboard will be. No height, grid, margin or padding is ever transitioned (the end-to-end test `fixed-cost.spec.ts` fails on any such property and on a gap of 120 ms or more between frames). With Reduce Motion everything is instant.

**The switch.** A pill of 51 by 31 like iOS (the app's buttons are at least 44 pt, so `.switch` sets its own size; the touch area is larger than what is drawn).

**Fixed amount (Išlaidų rūšys).** An expense kind has an optional `costCents` (positive whole cents, unindexed field of `options`; part of the backup file; older files simply have none, so no migration). In its row: "Fiksuota suma" with a switch, off for every kind that already exists. **iOS raises the keyboard only for a field that is focused inside the tap itself**, so the amount field is always in the page (a 1 px invisible box out of the layout while the switch is off) and the tap on the switch focuses it right there, with `inputmode=decimal`: the number pad rises with the first tap, no second tap on the field. In the same moment the field opens (the row grows, the rows below glide down). What she types is **saved as she types**; there is nothing to confirm or press. The pad's own OK key (`enterkeyhint=done`, Enter) lowers it and keeps the amount, and dragging the page lowers it too. **Emptying the field means she wants none:** the keyboard goes down and the whole row folds, all in that one move (and a field left empty or 0 when she walks away from it is off). **The switch can be pressed with the number pad up:** a press on it is never taken for "she left the field", which used to switch it off on touch-down and back on with the click. Turning the switch off by hand removes the amount and leaves the row open.

On the new-entry screen (Išlaida), picking a kind that has a fixed amount **fills the amount field with it** and says "Įprasta suma 450 €. Patvirtinkite arba pakeiskite."; the main button then reads "Patvirtinti 450 €" (the same step as "Toliau", then the time, then save). Typing another number turns the note into an orange "Pakeista, įprasta suma 450 €" and the button back into "Toliau". A kind without a fixed amount starts empty, as before: **nothing is assumed**. The stored entry is an ordinary expense with its own `amountCents`: changing the kind's amount later never changes entries already made.


## Gestures that take a whole page (and how they are kept from fighting what is on it)

Three gestures move a whole page sideways: **swipe back** (Nustatymai pages, the client card; from the left part only), **the pages of Išlaidos** (month, then the four pages of Analizė; anywhere on the tab), and **the days of the calendar** (`ui/swipe.ts`). One rule, `ui/gestures.ts`, keeps them from taking a drag that belongs to something else: **a drag that starts inside any element that scrolls sideways and has something to scroll (`overflow-x: auto|scroll` and `scrollWidth > clientWidth`) never belongs to the page.** It is a property of the element, not a list of names, so a new row of chips or a new strip is covered the moment it exists. (The fault that led to this: the swipe back once started anywhere on a page and knew only a short list of names, so a sideways drag on the length chips of a service took the whole page away, and the payers row on Išlaidos did the same to the pager.) Fields, wheels, charts and swipe rows keep their own drags through the same hooks' `IGNORE` lists as before.

**`tests/e2e/gesture-audit.spec.ts` enforces it.** For every Nustatymai page, for the client card and for Išlaidos it *finds* every element that scrolls sideways (it does not know their names), drags on each (from its left end and from its middle), and fails if the page moved or turned; it also checks that a swipe from the middle of a page does nothing and that one from the left part takes it. When a page gets a page-level gesture, add it to that file; when a new scrolling element is added to a page already in it, nothing needs to be done, the audit finds it.


## The calendar's bar: liquid glass

The bar is a three-column grid (`.cal-bar`: equal side columns, the switch in the middle), so the **Diena / Savaitė switch is exactly centred**, with the **month blob** at the left and the **round "+" blob** at the right. All three are liquid-glass capsules (`.lq`) of the same height (40 px, a little bigger than before) that hug their content with even padding: a translucent gradient over a blurred backdrop (`backdrop-filter`, switched off in Low Power Mode, where they become near-opaque), a bright rim, a soft shadow, label colour text (the "+" in blue). The month blob has no arrow; only while the month grid is open does it show a small chevron up. **Šiandien** is a glass blob of the same height **floating at the bottom left** of the calendar (above the tab bar, in every view), like the iOS Calendar's toolbar. The switch (`LiquidSeg` in `Segmented.tsx`) has a **glass drop** under the chosen label that slides to the other side on a spring with a little overshoot (`transform` only); on Mėnuo, where neither is chosen, the drop fades out. It all fits with the longest month names ("rugpjūtis", "rugsėjis") in every view with at least 6 px between the blobs; `calendar-glass.spec.ts` measures that for six months in the three views (centre, equal heights, even padding, no icon, no overlap). The same glass is used by the period pane on Analizė.

**The summaries (Dienos / Savaitės / Mėnesio suvestinė)** open as a bottom sheet that is as tall as its content, and with a lot in it grows **only up to the summary button that opened it** (the sheet's top stays just under that button, which and the title of the screen stay in view), in all three views. `Sheet` takes `maxTop` for that (`--sheet-top`); the default for every other sheet is unchanged (just under the status bar).
