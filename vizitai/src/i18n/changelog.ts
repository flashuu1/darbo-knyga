/**
 * What changed in each build, newest first. Shown in Nustatymai > Apie programą > Pakeitimų istorija.
 *
 * Rules (also in AGENTS.md): every build that is pushed gets an entry, with the date of the change and items of three
 * kinds only: bugfix, change, feature. The newest entry has no `build` yet: it describes the build that is running, and
 * the app shows that build's id on it. When the next build is prepared, the id of the build that was just shipped
 * (`git rev-parse --short HEAD`) is written into that entry first, and the new entry goes on top.
 */
export type ChangeKind = 'bugfix' | 'change' | 'feature';
export interface ChangeEntry {
  /** The short commit id of the build this shipped in. Absent only on the newest entry (the running build). */
  build?: string;
  /** The day the change was made or shipped, YYYY-MM-DD. */
  date: string;
  items: { kind: ChangeKind; text: string }[];
}

export const CHANGELOG: ChangeEntry[] = [
  { date: '2026-11-04', items: [
    { kind: 'bugfix', text: 'Atidarius mėnesio tinklelį, rodyklė prie mėnesio pavadinimo dabar tvarkingai viduryje: vienodi tarpai abiejose pusėse ir stiklo lašas ją visą apglėbia.' },
  ] },
  { build: 'aafbf77', date: '2026-11-04', items: [
    { kind: 'change', text: 'Klientas / Asmeninis / Išlaidos naujo įrašo pradžioje dabar yra to paties „skysto stiklo“ slankiklis.' },
    { kind: 'bugfix', text: 'Slankiklių užrašai (pvz. „Savaitė“) dabar tiksliai viduryje po stiklo lašu: visi pasirinkimai vienodo pločio.' },
  ] },
  { build: 'ee3ab60', date: '2026-11-04', items: [
    { kind: 'change', text: 'Kalendoriaus „stiklo“ lašai šiek tiek didesni ir apglėbia tekstą tolygiai; prie mėnesio nebėra „<“, plius taip pat stiklinis, o Diena / Savaitė slankiklis tiksliai viduryje.' },
    { kind: 'change', text: 'Šiandien perkelta į apatinį kairįjį ekrano kampą, kaip iOS kalendoriuje.' },
  ] },
  { build: 'ecc7fc0', date: '2026-11-04', items: [
    { kind: 'change', text: 'Kalendoriaus juosta tapo „skystu stiklu“: mėnuo, Diena / Savaitė slankiklis (su stiklo lašu, kuris slysta) ir Šiandien.' },
    { kind: 'bugfix', text: 'Dienos, Savaitės ir Mėnesio suvestinės, kai įrašų daug, nebekyla aukščiau už savo mygtuką.' },
  ] },
  { build: '5c3dbd3', date: '2026-11-04', items: [
    { kind: 'bugfix', text: 'Braukiant per trukmės pasirinkimus (3 val, 3 val 30 min...) puslapis nebeišnyksta: atgal grįžtama tik braukiant iš kairės ekrano dalies, o viskas, kas slenka į šonus, išsaugo savo braukimą.' },
    { kind: 'bugfix', text: 'Tas pats Išlaidose: braukiant per „Kas sumokėjo“ eilutę puslapis nebeverčiamas.' },
    { kind: 'change', text: 'Kliento kortelė taip pat grįžta atgal tik braukiant iš kairės dalies.' },
  ] },
  { build: 'bcd6170', date: '2026-11-04', items: [
    { kind: 'bugfix', text: 'Įjungus „Fiksuotą sumą“ klaviatūra iškart pasirodo ir žymeklis jau sumos lauke: nebereikia antro paspaudimo.' },
    { kind: 'change', text: 'Mygtuko „Gerai“ nebėra: suma išsaugoma renkant, o klaviatūrą nuleidžia jos pačios „OK“.' },
    { kind: 'change', text: 'Šiukšlinė tempiant eilutę dabar yra tik piktograma, be teksto.' },
  ] },
  { build: 'aae5e82', date: '2026-11-04', items: [
    { kind: 'change', text: 'Paslaugų, Asmeninių ir Išlaidų rūšių tvarka keičiama palaikius eilutę ir tempiant (rodyklių nebėra); puslapis pats slenka prie krašto.' },
    { kind: 'feature', text: 'Tempiant eilutę apačioje pakyla šiukšlinė: numetus eilutę ji pašalinama, parodomas patvirtinimas „Ištrinta“ ir galima Anuliuoti.' },
    { kind: 'change', text: 'Naujo įrašo pridėjimas dabar yra plius viršuje dešinėje, kaip kituose ekranuose.' },
  ] },
  { build: '4777b07', date: '2026-11-04', items: [
    { kind: 'bugfix', text: 'Paslaugų, Asmeninių ir Išlaidų rūšių eilutės atsidaro sklandžiai: judinamos tik transformacijomis, be aukščio ar tinklelio animacijų, ir atsidaro tik viena eilutė.' },
    { kind: 'bugfix', text: 'Fiksuotos sumos jungiklis vėl yra pailgas (buvo tapęs kvadratu) ir jį galima paspausti, kai rodoma skaičių klaviatūra: vienas paspaudimas išjungia.' },
    { kind: 'bugfix', text: 'Sumos laukas atsiranda kartu su klaviatūra, o klaviatūrą galima nuleisti mygtuku „Gerai“ arba patraukus puslapį.' },
  ] },
  { build: 'cf5b881', date: '2026-11-04', items: [
    { kind: 'change', text: 'Paslaugos, Asmeniniai ir Išlaidų rūšys perdarytos: kiekviena po vieną eilutę, palietus ji atsidaro vietoje (pavadinimas, trukmė, spalva, rodoma, tvarka, trynimas). Viskas, ką turite, išlieka.' },
    { kind: 'feature', text: 'Išlaidų rūšims galima įjungti „Fiksuotą sumą“: įjungus iškart išsiskleidžia suma ir pasirodo skaičių klaviatūra, o registruojant išlaidą suma jau įrašyta, jums tik reikia ją patvirtinti. Be fiksuotos sumos nieko neįrašoma.' },
    { kind: 'bugfix', text: 'Ištrynus fiksuotą sumą eilutė pati užsidaro, nebereikia spausti du kartus.' },
  ] },
  { build: '722ce53', date: '2026-11-04', items: [
    { kind: 'bugfix', text: 'Nustatymų puslapiai grįžta pirštu: braukiant į dešinę puslapis seka pirštą, o ne tik pasileidus atkuria animaciją.' },
    { kind: 'change', text: 'Atsarginės kopijos puslapis perdarytas pagal likusią programą: būsenos kortelė, didelis eksporto mygtukas ir kopijos eilutės su apvaliomis piktogramomis.' },
  ] },
  { build: 'e23d397', date: '2026-11-04', items: [
    { kind: 'feature', text: 'Atsarginė kopija: matomos paskutinės 3 eksportuotos kopijos ir 3 automatinės; palietus kopiją klausiama, ar atkurti, ir veiksmą galima anuliuoti. Failo rinkti nebereikia.' },
    { kind: 'change', text: 'Jei duomenys nepasikeitė nuo paskutinio eksporto, jie nebeeksportuojami antrą kartą, atkurti tų pačių duomenų nereikia, o priminimas apie kopiją neberodomas.' },
  ] },
  { build: '904f602', date: '2026-11-04', items: [
    { kind: 'feature', text: 'Mažos energijos režimas (iPhone ekranas 30 Hz): programa jį pati pastebi ir supaprastina animacijas: trumpesnės, be neryškinimo, mažiau konfeti ir blizgesių. Įprastame režime niekas nesikeičia.' },
  ] },
  { build: '70f1036', date: '2026-11-03', items: [
    { kind: 'change', text: 'Palaikymo kortelės nubraukimas: paleidus kortelė nesustoja, o išlaiko piršto greitį ir tarsi spyruoklė įsitraukia į nuotrauką ar mygtuką, palaipsniui mažėdama; išnyksta tik pačioje pabaigoje.' },
  ] },
  { build: '12b491b', date: '2026-11-03', items: [
    { kind: 'feature', text: 'Klientų kortelė: braukiant į dešinę bet kur ji nuseka pirštą ir grįžtama į sąrašą (ne tik mygtuku „Atgal“).' },
    { kind: 'feature', text: 'Palaikymo kortelę galima nubraukti bet kuria kryptimi: ji sugrįžta į nuotrauką ar mygtuką, iš kurio atsirado, ir iškart galima tikrinti kitą eilutę.' },
  ] },
  { build: '7038e3c', date: '2026-11-03', items: [
    { kind: 'change', text: 'Klientų eilutė pasako viską, kas aktualu: pinigai (mygtukas), kitas vizitas ir kaip praėjo paskutinis kartas (suma ir kada), net kai žalias mygtukas jau nebeberodomas.' },
    { kind: 'change', text: 'Palaikymo kortelėje rodomas ir kitas, ir paskutinis vizitas; apmokėto vizito sumą galima pakeisti („Keisti sumą“).' },
  ] },
  { build: 'b4c18bb', date: '2026-11-03', items: [
    { kind: 'change', text: 'Klientai: žalias „Sumokėta“ siauresnis, tokio pat dydžio kaip „Laukia sumos“: tik suma ir diena (pvz. 45 € · 10-31), be mėnesio pavadinimo ir metų. Palaikyti galima ir ant mygtuko.' },
  ] },
  { build: '18b6843', date: '2026-11-03', items: [
    { kind: 'change', text: 'Klientai: palaikius eilutę rodoma nauja maža kortelė (ne vizito langas): data ir laikas, paslauga, suma, telefonas. Laukiančiam sumos vizitui sumą galima įvesti čia pat; vizitas keičiamas tik kalendoriuje („Rodyti kalendoriuje“).' },
  ] },
  { build: 'bbdfa0b', date: '2026-11-03', items: [
    { kind: 'feature', text: 'Klientai: palaikius eilutę atidaromas vizitas, apie kurį ji kalba (laukiantis sumos, kitas, apmokėtas ar paskutinis), su visomis detalėmis.' },
  ] },
  { build: '328d667', date: '2026-11-03', items: [
    { kind: 'change', text: 'Naujas vizitas: vardų pasiūlymai atrodo kaip klientų sąrašas: nuotrauka su inicialais, surinktos raidės paryškintos, kada buvo ar kada kitas vizitas, kokia paslauga, ir oranžinė žyma, jei laukia suma.' },
  ] },
  { build: '08d759b', date: '2026-11-03', items: [
    { kind: 'feature', text: 'Nustatymai > Darbo laikas: galima pasirinkti, kuriomis savaitės dienomis dirbi; kitos dienos neįtraukiamos į dirbtas valandas.' },
  ] },
  { build: '6f6511e', date: '2026-11-03', items: [
    { kind: 'change', text: 'Dirbtos valandos: skaičiuojama visa darbo diena (pagal Darbo laiką) kiekvieną dieną, minus „Nedirbu“ laikas; vizitų trukmė nebenaudojama. „Užimtumas“ pakeistas dienomis su vizitais.' },
  ] },
  { build: 'ce22382', date: '2026-11-03', items: [
    { kind: 'feature', text: 'Išlaidos > Mėnuo: mėnesio rodikliai su rodyklėmis, palyginus su praėjusiu mėnesiu: vizitai, nauji klientai, vidutinė suma, užimtumas, dirbtos valandos, uždarbis už valandą, geriausios dienos, pajamos pagal paslaugą ir daugiausiai išleidusios. Keičiasi su mėnesio rodyklėmis.' },
  ] },
  { build: '6517b6d', date: '2026-11-03', items: [
    { kind: 'change', text: 'Analizė perkelta iš Klientų į Išlaidas (Mėnuo | Analizė), o Klientai skirti tik klientams. Braukimas į šonus Išlaidose perjungia mėnesį ir keturis Analizės puslapius.' },
  ] },
  { build: '3884463', date: '2026-11-03', items: [
    { kind: 'change', text: 'Paslaugų nustatymuose pašalintas gėlių efekto jungiklis; gėlių efektas lieka Vestuvėms.' },
  ] },
  { build: '857b0ea', date: '2026-11-03', items: [
    { kind: 'bugfix', text: 'Palaikius pirštą ekrane nebežymimas tekstas jokiame puslapyje (laukai lieka redaguojami).' },
    { kind: 'feature', text: 'Klientai: braukiant į šonus perjungiami puslapiai: Sąrašas, keturi Analizės puslapiai ir atgal.' },
  ] },
  { build: '951d013', date: '2026-11-03', items: [
    { kind: 'feature', text: 'Klientai: plytelės „Laukia sumos“, „Ateina šią savaitę“, „Seniai nebuvo“ ir „Neseniai buvo“ iškart nufiltruoja sąrašą; filtro ir rūšiavimo langas; paieška pagal vardą ir telefoną; naujo kliento pridėjimas.' },
    { kind: 'change', text: 'Klientų sąrašas: pirma laukiantys sumos, tada neseniai sumokėję, tada artimiausi vizitai. „Laukia sumos“ didesnis ir paspaudžiamas, žalias „Sumokėta“ su suma ir vizito data lieka dvi savaites.' },
    { kind: 'feature', text: 'Klientai > Analizė: nauji, dažniausi, pelningiausi ir laikas. Linijų grafikai, šilumos žemėlapis, apskritimas, reitingai, rekordai, palyginimo rodyklės, „kas kiek ateina“ ir prarasta dėl neatvykimų. Laikotarpį galima tempti arba rinktis stiklo mygtukais.' },
    { kind: 'change', text: 'Sklandesnės animacijos Klientų ir Analizės puslapiuose.' },
  ] },
  { build: 'b45e0d1', date: '2026-11-03', items: [
    { kind: 'bugfix', text: 'Įrašus, paslėptus už „+N“, dabar galima nutempti: palaikius „+N“ pakeliamas pats įrašas, o skaičius sumažėja.' },
  ] },
  { build: '00dd7be', date: '2026-11-03', items: [
    { kind: 'feature', text: 'Apie programą: pakeitimų istorija su klaidų taisymais, pakeitimais ir naujomis funkcijomis kiekvienam leidimui.' },
  ] },
  { build: '4910400', date: '2026-11-03', items: [
    { kind: 'feature', text: 'Persidengimo langas su detalėmis: kas, kokia paslauga ir nuo kada iki kada, ir ar vis tiek išsaugoti.' },
    { kind: 'change', text: 'Nedirbu viename ekrane: Nuo ir Iki šviečia pilkai mėlynai, įrašas kalendoriuje lieka raudonas.' },
    { kind: 'change', text: 'Tempiant įrašą kalendoriuje rodoma tik „Perkelta“, be perspėjimų apie persidengimą.' },
    { kind: 'change', text: 'Daktaras ir Masažas nebe raudoni ar rožiniai: raudona tik Asmeninis.' },
  ] },
  { build: '9ef66df', date: '2026-11-03', items: [
    { kind: 'feature', text: 'Asmeninis > Nedirbu: nuo kada iki kada nedirbi.' },
    { kind: 'bugfix', text: 'Nustatymuose naujas pasirinkimas apačioje nebelieka po klaviatūra, galima iškart rašyti.' },
  ] },
  { build: '553fd19', date: '2026-10-23', items: [
    { kind: 'change', text: 'Asmeninis įrašai ryškiai raudoni ir švyti.' },
  ] },
  { build: '718a04d', date: '2026-10-22', items: [
    { kind: 'change', text: 'Tempiant įrašą atgal į dabartinę savaitę užrašas sako „Ši savaitė“.' },
  ] },
  { build: 'f8e2096', date: '2026-10-22', items: [
    { kind: 'feature', text: 'Įrašą galima nutempti į kitą ar ankstesnę savaitę Savaitės rodinyje, su švytinčiu kraštu ir užrašu.' },
  ] },
  { build: '09bf329', date: '2026-10-22', items: [
    { kind: 'change', text: 'Pasirinkimai kortelėmis su paveikslėliais ir savo spalva.' },
  ] },
  { build: '91fbe66', date: '2026-10-22', items: [
    { kind: 'change', text: 'Iš Asmeninis pašalinti „Pertrauka“ ir „Vaikų reikalai“.' },
  ] },
  { build: '9e8e54c', date: '2026-10-22', items: [
    { kind: 'bugfix', text: 'Ilgi sąrašai (Asmeninis, vardų pasiūlymai) nebesutrumpėja ir slenka iki galo.' },
  ] },
  { build: '53f3b2c', date: '2026-10-22', items: [
    { kind: 'feature', text: 'Asmeninis: paruošti žodžiai (psichologas, daktaras ir kiti), pagal nutylėjimą 30 min.' },
    { kind: 'change', text: 'Laiko ratukai laisvesni: greitas pasukimas rieda toliau, o skaičius šviečia sukantis.' },
  ] },
  { build: 'ce41f88', date: '2026-10-22', items: [
    { kind: 'feature', text: 'Dienos, savaitės ir mėnesio suvestinė po vienu mygtuku.' },
    { kind: 'feature', text: 'Sumos pakeitimai užrašomi vizite.' },
    { kind: 'change', text: 'Įvedus 0 klausiama, ar nunulinti sumą.' },
  ] },
  { build: 'fd151ad', date: '2026-10-22', items: [
    { kind: 'feature', text: 'Dienos suvestinė: dienos pabaigos puslapis su sumomis vienu bakstelėjimu.' },
  ] },
  { build: '21cba3a', date: '2026-10-21', items: [
    { kind: 'bugfix', text: 'Švytėjimas ir gėlės matomi bet kokiu mastelio lygiu ir keičiasi suspaudžiant.' },
  ] },
  { build: 'cceef42', date: '2026-10-21', items: [
    { kind: 'feature', text: 'Vestuvės kaip paslauga su gėlių efektu prieš vizitą ir kol laukiama apmokėjimo.' },
  ] },
  { build: '4f612e8', date: '2026-10-21', items: [
    { kind: 'bugfix', text: 'Ilgi vizitai išlaiko vardą, net kai kalendorius nutolintas.' },
  ] },
  { build: '3f0dabb', date: '2026-10-21', items: [
    { kind: 'change', text: 'Įrašo langas pertvarkytas: kas ir kada, suma, veiksmai ir pavojingi veiksmai atskirai.' },
    { kind: 'feature', text: 'Bakstelėjus šalia plono įrašo atidaromas jis, o ne kuriamas naujas.' },
    { kind: 'feature', text: 'Ankstesnės sumos kaip greiti pasiūlymai ir konfeti išsaugojus sumą.' },
    { kind: 'change', text: 'Mygtukas „Ne“ gerai matomas.' },
  ] },
  { build: '7a770c4', date: '2026-10-21', items: [
    { kind: 'change', text: 'Greitesnės ir sklandesnės animacijos.' },
    { kind: 'feature', text: 'Palaikomas iOS „Sumažinti judėjimą“.' },
  ] },
  { build: '9424dfc', date: '2026-10-21', items: [
    { kind: 'change', text: 'Išlaidos: pirmiausia likutis, dienų diagrama ir kas sumokėjo; išlaidoms ramios spalvos.' },
  ] },
  { build: 'b2eac1f', date: '2026-10-21', items: [
    { kind: 'change', text: 'Nustatymai kaip iOS kategorijų sąrašas su atskirais puslapiais.' },
  ] },
  { build: '3834d57', date: '2026-10-14', items: [
    { kind: 'feature', text: 'Neapmokėti vizitai švyti oranžine spalva.' },
    { kind: 'feature', text: 'Sumą galima įvesti iš Klientų, po jos klausiama „Užregistruoti dar kartą?“.' },
  ] },
  { build: '8f4137d', date: '2026-10-13', items: [
    { kind: 'change', text: 'Sumos mygtukas be pilko rėmelio ir tiksliai virš klaviatūros.' },
  ] },
  { build: '5e32455', date: '2026-10-13', items: [
    { kind: 'feature', text: 'Sumos langas atidaro skaičių klaviatūrą, o „Patvirtinti“ yra virš jos.' },
  ] },
  { build: '1f11f43', date: '2026-10-13', items: [
    { kind: 'change', text: 'Pasirinkimai su iOS tipo apskritimais, kurie užsipildo paspaudus.' },
  ] },
  { build: 'f8c638a', date: '2026-10-13', items: [
    { kind: 'change', text: 'Našumas: sklandesnis slinkimas, kalendorius lieka atmintyje pereinant tarp skirtukų.' },
  ] },
  { build: '3f810ee', date: '2026-10-13', items: [
    { kind: 'feature', text: 'Išlaidų skirtukas su mėnesio apžvalga.' },
    { kind: 'change', text: 'Išlaida nebe vizitas: keičiama tik suma, data ir laikas. Šablonų nebėra, pasirinkimus susikuri pati.' },
    { kind: 'bugfix', text: 'Išlaida nebe žalia ir nebedaro įtakos balansui klaidingai.' },
  ] },
  { build: '5178242', date: '2026-10-13', items: [
    { kind: 'feature', text: 'Asmeninis ir išlaidų pasirinkimai nustatymuose; išlaidos ir balansas.' },
    { kind: 'bugfix', text: 'Vardų pasiūlymai telpa virš klaviatūros ir slenka.' },
    { kind: 'bugfix', text: 'Atšauktų klientų piktograma nebe didelė ir ovali.' },
  ] },
  { build: '67cd758', date: '2026-10-13', items: [
    { kind: 'change', text: 'Suspaudimas kaip žemėlapyje: pirštai skečiasi – didėja, suglaudžiami – mažėja.' },
    { kind: 'change', text: 'Nutolinus rodoma mažiau valandų ir linijų; sklandesnis Dienos ir Savaitės perjungimas.' },
  ] },
  { build: '1c9d9a0', date: '2026-10-13', items: [
    { kind: 'feature', text: 'Suspaudimu keičiamas kalendoriaus mastelis.' },
    { kind: 'change', text: 'Slinkimas tarp dienų ir savaičių seka pirštą.' },
    { kind: 'bugfix', text: 'Užrašas „Šią dieną vizitų nėra“ nebelieka ekrane.' },
  ] },
  { build: '3979b42', date: '2026-10-13', items: [
    { kind: 'feature', text: 'Klientus ir paslaugas galima ištrinti brūkštelėjus į kairę.' },
    { kind: 'feature', text: 'Atšaukti vizitai rodomi Klientuose; būsenos Laukiama, Nepatvirtinta, Įvyko.' },
    { kind: 'change', text: 'Pagrindinis mėlynas mygtukas visada vienoje vietoje, virš klaviatūros.' },
  ] },
  { build: '3936ace', date: '2026-10-13', items: [
    { kind: 'bugfix', text: '„Atgal“ iš „Užregistruoti į priekį“ grįžta ten, iš kur pradėta.' },
    { kind: 'change', text: 'Atšaukti vizitai saugomi savaitę, juos galima atnaujinti ar pakeisti.' },
  ] },
  { build: '2661d39', date: '2026-10-13', items: [
    { kind: 'feature', text: 'Laiko ratukai (bet kuri minutė) ir laisvas tempimas į bet kurią datą.' },
    { kind: 'feature', text: 'Vardų pasiūlymai po 2–3 raidžių; klientų sąrašas su apmokėjimo būsena.' },
    { kind: 'change', text: 'Visos paslaugos pagal nutylėjimą 15 min.; vizito atšaukimas tik su patvirtinimu.' },
  ] },
  { build: 'f72eb05', date: '2026-10-13', items: [
    { kind: 'feature', text: 'Naujas registravimo srautas (klientas, paslauga, laikas) ir sumos įvedimas.' },
    { kind: 'feature', text: 'Langai, kuriuos galima nustumti žemyn, su animacijomis.' },
  ] },
  { build: 'e9cde7e', date: '2026-10-13', items: [
    { kind: 'feature', text: 'Nustatymuose rodoma programos versija ir sukūrimo laikas.' },
  ] },
];
