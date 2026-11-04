# Vizitai: to-do list

The order below is a suggestion; the owner decides after testing what is built. The master picture is in `architecture.md` ("Product direction"): a personal assistant that keeps the books, one minute of use between clients, accurate numbers at the end of the day.

## Next, in the order agreed

- [x] **1. End-of-day screen ("Dienos suvestinė").** One page for the books of what is on screen: day, week or month (the button in the calendar follows the view), with one-tap chips of the usual amounts, the money, a small celebration. Amount changes are logged on the visit and 0 resets after a confirmation.
- [ ] **2. Prices per service.** A default price on each service, so the amount sheet and the end-of-day chips open pre-filled and a payment is one tap; later: earnings per service.
- [ ] **3. Client reminders in one tap.** A "Rytojaus klientai" list with a button that opens a ready-made SMS or WhatsApp message (no backend: the phone sends it).
- [ ] **4. "Kas turėtų grįžti".** Learn each client's rhythm (for example every 6 weeks), list who is overdue, rebook in one tap. First real assistant step. (The rhythm and the overdue list already exist inside Išlaidos > Analizė > Dažniausi; what is left is a list of its own with one-tap rebooking and reminders.)

## Klientai tab redesign

- [x] Done in the build of 2026-11-03: filter and sort sheet, tiles, search by name and phone, adding a client, the green "paid" pill, and the Analizė page, which now lives in Išlaidos (see `architecture.md`, "Klientai (list, filter) and Išlaidos > Analizė").
- [ ] Still open: quick actions on a row (call, message, book again), a richer client card (history, total spent, rhythm, notes), merging duplicates, a cancellation log so "money lost" can count cancellations older than a week.

## Also worth doing

- [ ] Client notes (hair formula, allergies, preferences), shown when she opens an entry.
- [ ] Repeating bookings ("every 6 weeks" in one tap).
- [ ] Days off and public holidays (greyed days, a block for lunch or time off).
- [ ] Free-time finder: pick a service, get the next free slots, copy them into a message (stepping stone to public availability).
- [ ] Insights: months compared, top clients, who has gone quiet, best days (needs the queue/filtering/smart indexing once there is data).
- [ ] Report for an accountant: monthly CSV or PDF of income and expenses.

## Risks and decisions to take together

- [ ] **Backup.** All data lives only on her phone and the backup is manual. A lost phone means lost books. A real fix (automatic cloud backup, a second device) needs a small backend; cheaper to decide before the data grows.
- [ ] **Public availability / self-booking.** Needs a backend, changes the "no network, one device" rule and the privacy position (GDPR). Decide together first; start with read-only availability, then booking requests that she approves.
- [ ] Revisit the queue, filtering and smart indexing once there are many clients.
- [ ] Install-screen wording for the Share menu is provisional.

## Analysis of 2026-11-04: what next, by impact

Measured first: with ten years of invented books (520 clients, 5,780 visits) the lists load in about 25 ms and the whole analysis in about 30 ms (in a test database; a phone is a few times slower, still fine). The app is about 370 KB. In 25 places a failed save is only written to a hidden log. Items are in the order of impact; effort S (hours), M (a day or two), L (more). Pick from here, a round at a time, tested and tried on the phone before the next.

### Round 1: protect the business
- [ ] **1. Backup that does not depend on remembering.** Done so far (build of 2026-11-04): the last 3 exports and 3 daily automatic copies are kept in the app and can be restored with a tap, unchanged books are never exported or restored twice, the banner stays away when nothing changed since the last export. Still open: nothing can write to Files by itself on iOS (see `architecture.md`, "Copies of the books"); a real automatic off-phone copy needs a cloud copy (a small backend, changes the "no network" rule). (L, decision)
- [ ] **2. No more silent failures.** A clear "Nepavyko išsaugoti" with a retry where a save fails (amounts, new visits, moves); today 25 places only log. (S)
- [ ] **3. A cancellation log.** Cancelled visits vanish after 7 days; keep a small permanent log so "Prarasta" and who cancels often can be counted. (S)

### Round 2: make the daily minute faster
- [ ] **4. Prices per service.** A default price per service so the amount sheet, the hold card and the day summary open pre-filled and a payment is one tap (also a different price per client?). Biggest daily time saver. (M)
- [ ] **5. Reminders in one tap.** "Rytojaus klientai" with a ready SMS or WhatsApp message. Decision: SMS or WhatsApp. (M)
- [ ] **6. "Kas turėtų grįžti" as a list of its own** with one-tap rebook and message (the rhythm is already in Išlaidos > Analizė > Dažniausi). (M)
- [ ] **7. Repeat bookings** ("every 6 weeks" in one tap). (S–M)
- [ ] **8. Rebook from the hold card** ("Registruoti dar kartą"). (S)

### Round 3: money accuracy
- [ ] **9. Deposits and part payments** (a wedding takes a prepayment; a visit is only "waiting" or "paid" today). (M)
- [ ] **10. Income that is not a visit** (products sold, tips). (M)
- [ ] **11. Accountant export** (monthly CSV or PDF of income and expenses in her accountant's format; the format is needed from her). (S–M)
- [ ] **12. Recurring expenses** (rent suggested every month). (S)

### Round 4: the calendar fits her real week
- [ ] **13. Working days and public holidays in the calendar** (grey the days she does not work, Lithuanian holidays without a network, warn when booking outside her hours). The working days already exist as a setting, used only by the statistics. (S–M)
- [ ] **14. Free-time finder** (a service, the next free slots, copy into a message; the first step to clients booking themselves). (M)
- [ ] **15. Visit lengths per client and buffers between visits.** (S)
- [ ] **16. Fill-a-gap suggestions** when someone cancels (overdue clients to call). (L)

### Round 5: know the client
- [ ] **17. Client notes** (formula, allergies) shown on the visit; photos later (storage and backup size). (M)
- [ ] **18. Merge duplicate clients.** (S–M)
- [ ] **19. Birthday, "how did they find you", a VIP marker** (the source would feed the "Nauji" analysis). (S)

### Round 6: quality and housekeeping
- [ ] **20. A real-device pass** on keyboards, gestures and Low Power Mode (only the owner can do this).
- [ ] **21. VoiceOver and large text audit** (20 screen-reader labels today).
- [ ] **22. Small-sample caution in Analizė** (hide or soften "↑ 200%" below about 5 visits).
- [ ] **23. Date wording consistency** (month names in lines, numbers in pills) and remove the hold card's unreachable no-show variant.
- [ ] **24. Keep the timing-sensitive end-to-end tests steady** (CI does not run them by choice, so they only show when run by hand).

### Decisions needed from the owner
Backup: Files/iCloud only, or also a cloud copy later? Reminders: SMS or WhatsApp? Prices: per service only, or per client too? Does she take deposits or sell products? What format does her accountant want? Which weekdays does she work?

