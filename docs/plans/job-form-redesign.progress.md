# Ledger: Job-Formular Redesign

Status je Schritt. Wird nach jedem Schritt aktualisiert, bevor irgendetwas anderes passiert.
Der Plan steht in `job-form-redesign.md`. Abschnitt 0 ist der Arbeitsvertrag, Abschnitt 1 sagt,
welche Bausteine aus dem Einstellungs-Umbau schon dastehen, Abschnitt 3.1 beschreibt den Befund,
um den es hier eigentlich geht, und Abschnitt 3.11 listet, was nachweislich in Ordnung ist.

Die Schritte 2 bis 9 betreffen das Formular, die Schritte 10 bis 12 je einen Dialog.

## Formular

- [x] 1 Ledger angelegt
- [x] 2 Die Bereitschaftsleiste, Anker und Hervorhebung
- [x] 3 Anbieter: Leerzustand, Aktion in den Kartenkopf
- [x] 4 Kanäle: Leerzustand, Semis Blau raus
- [x] 5 Veröffentlichung: Teilen und Aktivierung werden eine Karte
- [x] 6 Kommentar, Zurück-Knopf, Entwurfs-Banner
- [x] 7 Die Filterleiste verliert zwei von drei Akzentsignalen
- [x] 8 ProviderTable: Aktionen wie überall
- [x] 9 JobMutation.less: globaler Selektor, float, tote Klasse, freie Maße

## Je ein Dialog

- [x] 10 ProviderMutator: zwei Schritte, Fehler am Feld, dropdownClassName
- [x] 11 NotificationChannelPicker: Tokens, echter Leerzustand
- [x] 12 NotificationChannelEditor: zwei Gruppen, Fußzeile ohne float, Liste als Liste

## Abschluss

- [x] 13 Portal wird Anbieter (nur de.json)
- [x] 14 i18n in allen fünf Locales
- [x] 15 jobFormView.test.js
- [x] 16 Abnahme

## Notizen

### Abnahme (Schritt 16)

**Maschinell** — alles grün, Stand nach Schritt 16:

- `vitest run` (offline): 292 Dateien, 4035 Tests grün, 32 übersprungen. Darin
  `jobFormView.test.js` (50), `jobValidation.test.js`, `theme.test.js`, `locales.test.js`,
  `globalShadowing.test.js`.
- `yarn lint`: keine Meldung.
- `yarn format:check`: alle Dateien korrekt formatiert.
- `yarn build:frontend`: gebaut in 644 ms, keine Warnung zu ungenutzten Importen.
  `IconPlayCircle` ist aus der Importliste raus, `IconSetting` wird vom Verwalten-Link noch
  gebraucht.

**Von Hand, im Browser geprüft** (dunkles Thema, 1400 px, falls nicht anders vermerkt):

- Leeres Formular: Leiste nennt vier offene Punkte, „Speichern“ gesperrt.
- Klick auf „Anbieter“: Seite springt, Karte bekommt zwei Sekunden `outline: 2px solid` in
  `@color-warning`, danach wieder keinen.
- Name eingetragen → drei; Anbieter angelegt → einer (der Typ wurde aus der Miet-URL geraten);
  Kanal angehängt → Leiste wird grün, „Alles beisammen“, „Speichern“ als einziger gefüllter Knopf.
- Anbieter-Dialog: Startseiten-URL eingefügt → Fehler steht am URL-Feld, das Feld wird rot, kein
  Banner oben. Anbieter gewählt → Öffnen-Link erscheint in der reservierten 24-px-Zeile, das
  URL-Feld springt nicht.
- Anbieter-Aufklappliste: 474 px in einem 544 px breiten Dialog.
- Einstellungen → Sprache: Aufklappliste 200 px, genau so breit wie das Feld. Der globale
  25-rem-Selektor ist weg.
- Kanal-Wähler mit allen Kanälen am Job: Leerzustand mit Symbol, Satz und einem Knopf.
- Kanal-Editor: „Testen“ (outline) links, „Abbrechen“ (borderless) und „Speichern“ (solid) rechts,
  kein Blau. Zwei Gruppentitel „Der Kanal“ und „Zugangsdaten“, die Anleitung am Kopf der zweiten.
- Kanal-Editor leer gespeichert: zwei Aufzählungspunkte in einem `ul` direkt über der Fußzeile.
- Anbieter-Tabelle: Spalte heißt „Aktionen“, beide Knöpfe `borderless`, nur Löschen in `danger`.
- Filterleiste: ein Rahmen in `@color-border`, die Versalpille ist ein graues Wort.

**Helles Thema** (über `body[theme-mode=light]` umgeschaltet, ohne die gespeicherte Einstellung
des Benutzers anzufassen): dieselben Punkte. Bereitschaftsleiste in beiden Zuständen lesbar
(Beschriftung `#1d1916` auf `rgba(38,28,22,.03)` bzw. auf `#ddebe2`). Der Feldfehler im
Anbieter-Dialog misst 5,7:1 auf dem hellen Dialoggrund, AA erfüllt.

**Mobil, 390 px**: Die Leiste bricht auf zwei Zeilen um, „Veröffentlichung“ zeigt Beschriftung
über Steuerelement (`flex-direction: column`), die Dialoge sind 95 % breit, kein waagerechter
Seitenscroll (`scrollWidth == clientWidth == 390`).

**Tastatur**: Jeder Sprungknopf ist per Tab erreichbar, `:focus-visible` greift und zeigt
`2px solid @color-accent` mit 2 px Versatz. Nach dem Sprung bleibt der Fokus auf dem Knopf, der
gedrückt wurde — er landet nicht im Nichts.

### Abweichungen vom Plan, und warum

Fünf Stellen, an denen der Plan sich selbst widersprochen hätte. Jedes Mal hat die Absicht des
Plans gewonnen, nicht sein Buchstabe.

1. **`ProviderMutator.less`, `&__step`.** Der Plan schreibt `display: flex; flex-direction: column`
   auf ein `li` und nennt die Schritte zugleich „nummeriert“. Ein Flex-`li` verliert seine
   Zählmarke — im Browser nachgeprüft, die „1.“ und „2.“ fehlten. Jetzt `display: list-item` mit
   `display: block` an `&__stepTitle` und `&__stepHint`, was dieselbe Stapelung ergibt und die
   Nummern zurückbringt.
2. **`JobReadinessBar.less`, `&__item:focus-visible`.** `Index.less` Zeile 88 löscht mit
   `outline: none !important` jeden Fokusring der Anwendung. Ohne `!important` gab es hier keinen
   Ring, was die Abnahme ausdrücklich verlangt. `Index.less` ist nach Abschnitt 6 tabu, also
   gewinnt die Regel dieser Komponente für sich allein. Der Ring ist Fredys Akzent, nicht Semis.
3. **Drei Kommentare umformuliert.** Die Kommentartexte aus dem Plan enthalten wörtlich
   `dangerouslySetInnerHTML`, `join('<br/>')`, `float: left` und
   `.providerMutator .semi-select-option-list-wrapper` — genau die vier Zeichenfolgen, die
   `jobFormView.test.js` aus Schritt 15 in denselben Dateien verbietet. Der Plan hätte seinen
   eigenen Test nicht bestanden. Die Kommentare sagen jetzt dasselbe in Worten statt in Code, der
   Test aus Schritt 15 steht unverändert.
4. **`provider.errorTitle` gelöscht.** Schritt 14 nennt die Regel („zu löschen, weil nach
   Schritt 10 nicht mehr gerufen“) und übersieht diesen Schlüssel. Nach Schritt 10 ruft ihn nichts
   mehr, also fällt er in allen fünf Dateien mit.
5. **`notification.channels.pickerEmptyLead` und `pickerEmptyLink` bleiben stehen.** Schritt 11
   ersetzt sie durch `emptyTitle`/`emptyText`/`emptyAction`, der Plan listet sie aber nicht zum
   Löschen auf. Sie sind jetzt tot. Nicht angefasst, weil `locales.test.js` sie nicht beanstandet
   und der Plan sie ausdrücklich nicht nennt — ein Kandidat für einen eigenen Aufräum-Commit,
   zusammen mit `notification.channels.pickerEmpty` und `pickerCreate`, die schon vorher tot waren.

### Nicht committet

Nach Anweisung des Benutzers wurde nichts committet. Der Arbeitsvertrag („ein Schritt, ein
Commit“) ist in diesem Punkt überstimmt; der Ledger wurde nach jedem Schritt fortgeschrieben.
