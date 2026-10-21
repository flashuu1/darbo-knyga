# Vizitai: to-do list

The order below is a suggestion; the owner decides after testing what is built. The master picture is in `architecture.md` ("Product direction"): a personal assistant that keeps the books, one minute of use between clients, accurate numbers at the end of the day.

## Next, in the order agreed

- [x] **1. End-of-day screen ("Dienos suvestinė").** One page for the day: what waits for its amount with one-tap chips of the client's usual amounts, what is in, the day's money, a small celebration when the day is settled. Opens from the balance line in the calendar; the badge counts what waits.
- [ ] **2. Prices per service.** A default price on each service, so the amount sheet and the end-of-day chips open pre-filled and a payment is one tap; later: earnings per service.
- [ ] **3. Client reminders in one tap.** A "Rytojaus klientai" list with a button that opens a ready-made SMS or WhatsApp message (no backend: the phone sends it).
- [ ] **4. "Kas turėtų grįžti".** Learn each client's rhythm (for example every 6 weeks), list who is overdue, rebook in one tap. First real assistant step.

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
