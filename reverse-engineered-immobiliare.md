# Reverse Engineered Immobiliare.it

Immobiliare.it is Italy's largest property portal. Its pages sit behind DataDome; the endpoint those
pages call for their results does not. This file records what was measured about both, and about the
android app, whose geography service is what lets a search url be read without a browser.

The provider is `lib/provider/immobiliare.js`. The translation from a website search url into a
search the endpoint answers is in `lib/services/immobiliare/`.

## Two hosts

| Host                        | Serves                                                                               | Protected                          |
| --------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| `www.immobiliare.it`        | the website, and `/api-next/search-list/listings/`, which its pages call for results | the pages are, the endpoint is not |
| `android-imm-v4.ws-app.com` | the android app's api: properties, and a geography service                           | no                                 |

The provider searches through the website's own endpoint, and looks places up through the app's
geography service. That pairing is deliberate, and the section on the app's search api says why.

## Reading a search url

A url says three things, and all three are read:

- the first path segment says what is on offer and on what terms - `lib/services/immobiliare/web-paths.js`
- the segments after it name the place - `lib/services/immobiliare/geography.js`
- the query string carries the filters, which travel to the endpoint untouched

Only the place needs a lookup. That is the whole reason a town search used to need a browser: the
endpoint filters by `idComune=7369` and the url says `erbusco`, and nothing but a rendered page
carried the number. The rendered page still does, in `__NEXT_DATA__`, under the react-query key
`real-estate-list`; that route is now the fallback.

Because the filters are passed through rather than translated, a filter this has never seen still
works: the endpoint reads the very parameter names the website put in the url. Only `pag` is
removed, being a property of the request rather than of the search.

### The filters, and who validates them

The website's search form carries its whole vocabulary in a javascript chunk of the homepage
(`s1.immobiliare.it/_next/static/chunks/`, the module whose enum begins `CONTRACT="idContratto"`).
There are 56 of them:

```
idContratto idCategoria idTipologia prezzo prezzoMinimo prezzoMassimo superficie superficieMinima
superficieMassima locali localiMinimo localiMassimo camereDaLetto camereDaLettoMinimo
camereDaLettoMassimo bagni stato tipoProprieta fasciaPiano usoEdificio boxAuto riscaldamenti
balconeOterrazzo giardino classeEnergetica vista ascensore cantina piscina arredato lusso vacanze
perStudenti animali fumatore sistemaAllarmeVigilanza virtualTour aReddito noAste noAgenzie lowcost
seaView seaDistance keyword keywords tipologiaStanza tipologiaPostoLetto sessoInquilini
occupazioneInquilini fkLicenza fkAssociazione idFranchising otherFeatures criterio ordine __lang
```

They are not translated one by one, and they do not need to be: the endpoint is the website's own
and reads these very names. What matters is that **the endpoint validates them**. An unknown name
answers `Route not found`, and a value in a shape it does not expect answers 422 naming the field
it refused:

```
{"errors":[{"message":"Questo valore dovrebbe essere di tipo unknown.","code":null,"path":"energyEfficiencyId"}]}
```

That is the reason the provider treats a refusal as a url it could not read after all, and renders
the page instead of answering with nothing. A filter whose value domain is unknown therefore costs
a browser, never a silently wider search.

Confirmed as passing through untouched, by a count that moves when they are applied:
`prezzoMinimo`, `prezzoMassimo`, `superficieMinima`, `superficieMassima`, `localiMinimo`, `bagni`,
`ascensore`, `cantina`, `arredato`, `noAste`, `fasciaPiano[]`, `balconeOterrazzo[]`,
`idTipologia[]`, `boxAuto[]`.

### The category table

Each entry in `web-paths.js` was confirmed against the endpoint, which describes every search it
answers in `seoData.subtitle` - "appartamenti in vendita Roma". To confirm a new one, ask for it and
read that line back:

```
curl -s -H 'Accept: application/json' -H 'Referer: https://www.immobiliare.it/' \
  'https://www.immobiliare.it/api-next/search-list/listings/?idNazione=IT&idContratto=1&idCategoria=1&idComune=6737&path=%2Fvendita-case%2Froma%2F' \
  | jq '.seoData.subtitle, .count'
```

The id vocabularies come from the same chunk. Categories: residenziale 1, commerciale 2, turistico
3, stanze 4, nuove costruzioni 6, aste 14, palazzi 20, magazzini 21, garage 22, uffici 23, terreni
24, capannoni 25, negozi 26. Typologies: appartamento 4, attico-mansarda 5, box 6, casa
indipendente 7, palazzo 10, rustico-casale 11, villa 12, villetta a schiera 13, loft 31, negozio
55, ufficio 56, capannone 59, magazzino 61, stanza 81.

Confirmed: `vendita`/`affitto` are `idContratto` 1 and 2; `case` is `idCategoria=1` with no type;
`appartamenti`, `attici`, `case-indipendenti`, `ville` and `villette` add `idTipologia[]` 4, 5, 7,
12 and 13.

The endpoint reads `path` for routing and not for filtering: asking for `/affitto-attici/roma/` with
`idContratto=1` answers "attici in vendita Roma". The criteria are the search; the path only has to
be one the portal recognises.

The commercial categories are deliberately absent. `/vendita-uffici/` with the category that seemed
to fit answered "case in vendita Roma" and a larger count, which is a different search wearing the
right url. A wrong entry here silently widens somebody's search, so an unconfirmed one is left out
and its url is rendered instead.

The endpoint requires `idNazione`, `idContratto` and `idCategoria`; it will not infer them from
`path`, and it answers `Bad Request` without them. It validates `path` as well, answering
`Route not found` for a path it does not recognise - and for an unknown query parameter, which is
how `idMZona[]` was found and `idQuartiere[]` ruled out.

## The dates

Neither search shape carries a date - read an advert of the endpoint's answer whole and there is
nothing to find, which is why the site can only show one on the detail page. The android app's
property detail does carry them, on the same unprotected host its geography service sits on:

```
GET https://android-imm-v4.ws-app.com/b2c/v2/properties/<id>
```

No key, no token. The answer carries `creationDate` and `lastModified`, both epoch **seconds** -
the one unit conversion in the provider - and `soldTransactionDate`, which is about a sale that
already happened and is left alone. One request per *new* listing is what a run costs: the pipeline
enriches only what it has not stored yet. Fredy keeps the later of the two dates, because a
re-published advert is the portal's own notion of "newer".

## The geography service

`GET https://android-imm-v4.ws-app.com/b2c/v1/geography/autocomplete?query=<words>`

No key, no token, no session. It answers with matching places, each carrying the chain above it:

```json
[
  {
    "id": "10070",
    "type": 3,
    "label": "Città Studi, Susa",
    "parents": [
      { "id": "8042", "type": 2, "label": "Milano" },
      { "id": "MI", "type": 1, "label": "Milano" },
      { "id": "lom", "type": 0, "label": "Lombardia" },
      { "id": "IT", "type": -1, "label": "Italia" }
    ]
  }
]
```

`type` says the level, and each level is a parameter of the search endpoint:

| type | level    | parameter     |
| ---- | -------- | ------------- |
| -1   | nation   | `idNazione`   |
| 0    | region   | `fkRegione`   |
| 1    | province | `idProvincia` |
| 2    | city     | `idComune`    |
| 3    | quarter  | `idMZona[]`   |

These are the same ids the website uses. Erbusco is 7369 in the app's answer, in the listing payload
and in the criteria a rendered page reports.

The service ranks by relevance, and a name alone does not identify a place: "Brescia" comes back as
a province, as the city in it, and as a quarter of a town in Rimini. The url's grammar settles it -
one segment means the city, `<name>-provincia` means the province, two segments mean a quarter of
the town named first - so the level is chosen and not merely ranked. A label is qualified with
another place ("Città Studi, Susa"), so only the part before the comma is matched.

The other endpoint of that service, `/b2c/v1/geography/polygons`, answers with the outline of a
place as `points: [[lat, lng], ...]`, taking exactly one of `cityId`, `provinceId`, `regionId` and
`nationId`. It is not used, because the search endpoint filters by id and an outline is the less
exact of the two, but it is what a search by drawn area would want.

## The app's own search api, and why it is not used

`GET https://android-imm-v4.ws-app.com/b2c/v1/properties` answers a search with no bot wall and no
credentials - five headers are enough, of which only the user agent is peculiar:

```
user-agent: WSCommand3<Furious>|REL|PRD|1080,2410,2.625|26.13.0|ANDROID|Google Pixel 10 Pro|17|PHO|2.0-01/09/2016-16:40|0|0
accept-language: it-IT
x-currency: EUR
x-measurement-unit: meters
immo-id: <uuid, one per install>
```

The dynatrace and sentry headers the app sends are telemetry and can be dropped. `/count` answers
the same search with the total alone. `start` is an offset, a page holds 20, and `totalActive` is
the total.

Its parameters are short and its filter names come in families - `ac2_*` for the property's own
attributes, `ac3_*` for what comes with it. The full vocabulary is in the app: unpack the apk, run
`strings` over `classes*.dex`, and grep for `ac2_`. That is how `ac2_noaste` and `ac3_bauto` were
found after guessing had failed.

A map search translates into it exactly. `vrt=lat,lng;lat,lng` becomes `points=lat,lng lat,lng`,
`idContratto` 1 and 2 become `t=v` and `t=a`, `idCategoria` becomes `cat`, `idTipologia[]` becomes
`tip` with the same numbers, `prezzoMinimo`/`prezzoMassimo` become `pm`/`px`,
`superficieMinima`/`superficieMassima` become `sm`/`sx`, `noAste` becomes `ac2_noaste` and
`boxAuto[]` becomes `ac3_bauto`. A search the website reports 27 adverts for answers 27 here.

It is not what the provider searches through, for three measured reasons:

- It has no location filter. Every id parameter tried - `idmc`, `idComune`, `mc`, `idc` - is
  ignored in silence and answers with all of Italy, 850071 adverts. An area is a polygon or a centre
  and a radius, and `geography/polygons` has no quarter level, so a quarter search cannot be
  expressed at all.
- It has no sort. `ord`, `criterio` and `sort` leave the order untouched, while the website's
  endpoint honours `criterio=data&ordine=desc`, which is what puts a new advert on the first page.
- Every filter would have to be translated, and a name it does not know is ignored rather than
  refused - a silently wider search.

An unknown value is ignored the same way: `t=l` answers exactly what `t=v` answers rather than
failing, so only known values may be sent.

The app's search payload is richer than the website's, and worth knowing about: it carries
`creationDate` and `lastModified` as timestamps, `price.raw`, `geography.geolocation` with a
`visibilityType`, the street, the zipcode, and both photos and floor plans.
