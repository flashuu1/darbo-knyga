export const lt = {
  'app.name': 'Vizitai',
  'boot.error': 'Nepavyko atidaryti programėlės. Uždarykite ją ir atidarykite iš naujo.',
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
  'settings.version': 'Versija', 'settings.build': 'Sukurta: {data} · {id}', 'settings.storage': 'Saugykla',
  'service.add': 'Pridėti paslaugą', 'service.new': 'Nauja paslauga', 'service.hide': 'Paslėpti', 'service.show': 'Rodyti',
  'service.hidden': 'Paslėpta', 'service.minutes': 'Trukmė (min.)', 'service.lastActive': 'Turi likti bent viena paslauga',
  'service.default.cut': 'Kirpimas', 'service.default.color': 'Dažymas', 'service.default.cutColor': 'Kirpimas ir dažymas',
  'service.default.highlights': 'Sruogelės', 'service.default.style': 'Šukuosena', 'service.default.other': 'Kita',
  'hours.start': 'Pradžia', 'hours.end': 'Pabaiga', 'hours.invalid': 'Pabaiga turi būti vėlesnė už pradžią',
  'backup.export': 'Eksportuoti duomenis', 'backup.import': 'Atkurti iš failo',
  'backup.confirm': 'Pakeisti visus esamus duomenis?', 'backup.replace': 'Pakeisti',
  'backup.imported': 'Duomenys atkurti', 'backup.exported': 'Kopija sukurta',
  'backup.error.format': 'Netinkamas failas', 'backup.error.export': 'Nepavyko sukurti kopijos', 'backup.error.newer': 'Failas sukurtas naujesnės programos versijos',
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
