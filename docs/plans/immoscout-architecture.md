# ImmoScout: leichter bauen, ohne Features zu verlieren

Stand nach dem Österreich-Umbau. Erster Teil beschreibt, was jetzt da ist und warum. Zweiter Teil
sind Vorschläge, die noch nicht umgesetzt sind, mit Aufwand und Risiko.

## Wo das Gewicht liegt

Gemessen, nicht geschätzt (`wc -l`):

| Datei | LOC | Art |
|---|---:|---|
| `lib/services/immoscout/mobileApi.js` | 526 | Engine: Requests, Parser, Probes, Provider-Factory |
| `lib/services/immoscout/at-paths.js` | 452 | AT-Tabellen |
| `lib/services/immoscout/web-paths.js` | 253 | DE-Tabellen |
| `lib/services/immoscout/immoscout-web-translator.js` | 249 | URL-Zusammenbau, beide Länder |
| `lib/services/immoscout/param-support.js` | 201 | Parameter × Typ Matrix |
| `lib/services/immoscout/shape.js` | 82 | Polyline-Dekodierung |
| `lib/services/immoscout/real-estate-types.js` | 62 | Vokabular |
| `lib/provider/immoscoutAt.js` | 38 | Deskriptor |
| `lib/provider/immoscout.js` | 26 | Deskriptor |
| **Summe** | **1889** | |

Vorher (nur Deutschland): 1190 LOC, davon 457 im Provider selbst.

Österreich hat **604 Zeilen** gekostet (`at-paths.js` + `immoscoutAt.js` + 114 Zeilen Translator).
Ein zweiter Provider per Copy-Paste hätte rund 900 gekostet **und** eine zweite Kopie des
526-Zeilen-Clients erzeugt, die bei jedem API-Wechsel mitgezogen werden müsste.

Entscheidend für alles Weitere: **rund 900 der 1889 Zeilen sind handgepflegte Tabellen**
(`at-paths`, `web-paths`, `param-support`). Das ist der Teil, der verrottet, wenn ImmoScout eine
Seite ändert, und der Teil, den niemand vollständig bekommt.

## Was jetzt steht: Deskriptor über Engine

Ein nationales Portal steuert genau zwei Dinge bei: seine Identität und einen Leser für seine
URL-Form. Alles andere ist identisch, weil hinter beiden Sites **eine** API auf **einem** Index
liegt.

```
lib/provider/immoscout.js  ─┐
                            ├─→ buildImmoscoutProvider(portal) ─→ mobileApi.js (Engine)
lib/provider/immoscoutAt.js ┘         ↑
                                      └── portal.toMobileSearchUrl ─→ web-paths.js | at-paths.js
```

Zwei Entwurfsentscheidungen, die nicht offensichtlich sind:

- **`baseUrl` ≠ wo das Inserat liegt.** Das AT-Portal ist `immobilienscout24.at`, aber ein
  österreichisches Inserat wird vom deutschen Index unter einer deutschen numerischen ID
  ausgeliefert, und die API nennt selbst die `.de`-Seite als Share-Link. Deshalb gibt es
  `EXPOSE_BASE_URL` getrennt von `portal.baseUrl`. Ein aus `baseUrl` gebauter Link wäre 404.
- **Zwei Provider statt `countries: ['de','at']`.** Weil die API einen gemeinsamen ID-Raum
  zurückgibt, könnte ein `countryOf(listing)` die beiden nie auseinanderhalten. Ein Provider pro
  Site deklariert ein Land, und die Frage stellt sich nicht. Geocoder und Karte bekommen eine
  Antwort, die stimmt.

## Vorschlag 1: `param-support.js` durch die API selbst ersetzen

**Das größte Einzelstück, das weg kann.** 201 Zeilen Matrix, aufgenommen durch Replay.

Die API sagt bei jeder Ablehnung, **welchen** Parameter sie meint. Diese Session verifiziert, alle
drei Fälle:

```
haspromotion auf housebuy      → ERROR_COMMON_URL_PARAMETER_NOT_SUPPORTED
                                 "The parameter [haspromotion] is not supported."
pricetype=calculatedtotalrent
             auf houserent     → ERROR_COMMON_URL_PARAMETER_VALIDATION_FAILED
                                 "The parameter [pricetype] has an invalid value [calculatedtotalrent]."
unbekannter Parameter          → ERROR_COMMON_URL_PARAMETER_NOT_SUPPORTED
                                 "The parameter [fredynonsense] is not supported."
```

Statt die Matrix zu pflegen: **schicken, Ablehnung lesen, genannten Parameter streichen, erneut
schicken.** Ergebnis pro `(realestatetype, parameter)` in einem Cache lernen, damit es einmal pro
Instanz kostet und nicht pro Lauf.

Das ist nicht nur kürzer, es ist **feature-completer**: heute wird ein Filter, den niemand
aufgenommen hat, mit `no translator` verworfen und die Suche läuft breiter als gesetzt. Mit dem
Reader funktioniert er, sobald die API ihn akzeptiert.

- **Gewinn:** ~160 der 201 Zeilen weg. Übrig bleiben die Noise-Liste und der 412-Leser.
- **Kosten:** beim ersten Lauf bis zu N Zusatz-Requests, N = Zahl der abgelehnten Parameter. Die
  API nennt pro 412 nur *einen*, also iterativ. Mit Cache konvergiert das nach einem Lauf.
- **Risiko:** ein 412 aus anderem Grund darf nicht als "Parameter nicht unterstützt" gelernt
  werden. Absichern, indem nur auf die zwei bekannten `messageCode` gelernt wird und die
  Iteration hart gedeckelt ist.

## Vorschlag 2: Pfadtabellen nicht mehr pflegen, sondern die Seite fragen

`web-paths.js` sagt im eigenen Kopfkommentar, wie die Tabelle entstanden ist: jede Suchseite
berichtet die API-URL, zu der sie aufgelöst hat, in einem Feld `lastSearchApiUrl`.

Wenn das noch stimmt, ist die 253-Zeilen-Tabelle ersetzbar: beim **Speichern** eines Jobs die
Suchseite einmal laden, `lastSearchApiUrl` lesen, die Mobile-URL am Job ablegen. Tabelle bleibt
als Fallback, darf aber verrotten, ohne dass jemand etwas merkt.

- **Gewinn:** jeder ImmoScout-Filter funktioniert ab Tag eins, auch die, die keine Tabelle kennt.
  `Real estate type not found` verschwindet als Fehlerklasse.
- **Kosten:** ein Request pro Job-Speicherung, nicht pro Lauf.
- **Risiko, und zwar ein echtes:** die DE-Seite antwortet auf einfache Requests mit 401 (in dieser
  Session gemessen, für `/Suche/...` genauso wie für `/expose/...`). Das bräuchte also den
  Browser- oder Proxy-Pfad, den das Repo für andere Provider schon hat, und würde ImmoScout die
  Eigenschaft nehmen, der einzige vollständig browserfreie Provider zu sein. **Ich konnte
  `lastSearchApiUrl` in dieser Session nicht nachprüfen**, genau wegen dieser 401. Vor einer
  Umsetzung gehört das verifiziert, sonst ist der ganze Vorschlag Spekulation auf einem
  Kommentar.
- Für Österreich gilt er ohnehin nicht: die AT-Seite ist eine andere Anwendung und hat das Feld
  nicht.

## Vorschlag 3: eine Slug-Tabelle mit Länder-Overlays statt zweier Vokabulare

`web-paths.js` und `at-paths.js` beschreiben dieselbe API mit zwei getrennten Tabellen. Rund zehn
Slugs sind identisch (`wohnung-mieten`, `haus-kaufen`, …) und stehen doppelt.

Eine gemeinsame Basis `slug → (realType, params)` plus je ein Overlay pro Site würde die Dopplung
entfernen und, wichtiger, sichtbar machen, welche Site was kann.

- **Gewinn:** klein, geschätzt 40–60 Zeilen, plus deutlich bessere Lesbarkeit.
- **Kosten:** ein Umbau an zwei getesteten Tabellen ohne funktionalen Nutzen.
- **Einschätzung:** erst machen, wenn eine dritte Site dazukommt. Bei zwei ist die Trennung noch
  ehrlicher als die Abstraktion, weil die beiden Sites tatsächlich verschiedene Vokabulare haben.

## Was nicht geht

**Schweiz passt nicht in diese Architektur.** `immoscout24.ch` gehört einer anderen Firma
(SMG Swiss Marketplace Group), läuft auf einer anderen Plattform hinter Cloudflare und DataDome,
und hat **null** Inserate in diesem Index: `/ch`, `/ch/zuerich` und `/ch/bern` antworten mit
`totalResults: 0`, `/ch/zurich/zurich` und `/ch/geneve` mit 412. `api.immoscout24.ch` existiert,
antwortet aber auf jedem Pfad mit 403.

Ein CH-Provider wäre ein eigenes Reverse-Engineering-Projekt und teilt sich mit diesem Konstrukt
nichts außer dem Namen. Die Schweiz ist bereits über `flatfox` (`['ch']`) und `betterhomes`
(`['de','at','ch']`) abgedeckt.

## Reihenfolge, wenn umgesetzt wird

1. **Vorschlag 1** zuerst. Größter Gewinn, geringstes Risiko, keine neue Abhängigkeit, und macht
   das Produkt nebenbei vollständiger statt nur kleiner.
2. **Vorschlag 2** nur nach Verifikation von `lastSearchApiUrl` über den Browser-Pfad. Wenn das
   Feld weg ist, fällt der Vorschlag ersatzlos.
3. **Vorschlag 3** zurückstellen bis zu einer dritten Site.
