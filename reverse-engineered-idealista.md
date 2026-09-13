# Reverse Engineered Idealista's Mobile API

Idealista is one portal serving three countries - Spain, Italy and Portugal - as three sites of the
same application. Its website sits behind DataDome, which a headless browser rarely clears, so Fredy
reads it through an external challenge-solving scrape service where one is configured and through
the run's own browser otherwise. The android app talks to a different host, and that host serves
JSON to a plain HTTPS request. This file records what that api is, because none of it is documented
and all of it was measured.

The provider is `lib/provider/idealista.js`. The translation from a website search url into an api
search is in `lib/services/idealista/`, and which country a job speaks to is read off the hostname
of its url by `lib/services/idealista/portal.js`.

## Hosts

There is one set of these per country, and they differ in nothing but the domain: the same client
key, the same signing key, the same paths with the country code swapped, the same answers. `<tld>`
is `com` for Spain, `it` for Italy, `pt` for Portugal, and `<cc>` is `es`, `it` and `pt`
respectively - note that the Spanish site is `idealista.com` and its country code is `es`.

| Host                  | Serves                                                             | Protected |
| --------------------- | ------------------------------------------------------------------ | --------- |
| `app.idealista.<tld>` | the app's JSON api - tokens, searches, the catalogue of locations  | no        |
| `mt1.idealista.<tld>` | the map's tiles, the outline of every area, the tree of area codes | no        |
| `www.idealista.<tld>` | the website, and the ajax endpoints its pages call                 | DataDome  |

Only the first two are used. The third is read behind the wall, and only for a search the api
cannot be asked for.

The host is also what says which country a *stored* listing is in, which nothing else about the row
does: the provider declares `countries: ['es', 'it', 'pt']` for the job form and the map, and
`metaInformation.countryOf` narrows that to the one country an advert's own link names, so its
address is geocoded in Spain rather than in three countries at once and its coverage lookup goes to
the register of the country it is actually in.

### What was measured across the three, and when

Probed in September 2026 through the provider's own modules, one run per country:

| Asked                                                    | es                          | it                      | pt                       |
| -------------------------------------------------------- | --------------------------- | ----------------------- | ------------------------ |
| `POST /api/oauth/token`                                  | granted                     | granted                 | granted                  |
| `GET /api/3.5/<cc>/deeplinks/parse/search` on a slug url | `0-EU-ES-28-07-001-079`     | `0-EU-IT-RM-01-001-097` | `0-EU-PT-11-06`          |
| `POST /api/3.5/<cc>/search` by that location id          | 10603 adverts, "Madrid"     | 4131 adverts, "Roma"    | 5495 adverts, "Lisboa"   |
| an advert's `url`                                        | `/inmueble/<code>/`         | `/immobile/<code>/`     | `/imovel/<code>/`        |
| `GET /api/3/<cc>/detail/<code>`                          | "Anuncio actualizado hace…" | "Annuncio aggiornato…"  | "Anúncio atualizado há…" |

Two things the Italian notes below no longer hold on their own: the parser **does** resolve a slug
url to its location id on all three sites (it was measured not to on .it when only Italy was
covered), and `firstActivationDate` is back on the adverts a live search answers.

The signing key, the client key, the app version and the device id are one set for all three
hosts - only the bearer token is per host, since a token granted by one country's api means nothing
to another's.

### The word each site spells differently

Confirmed by handing each url to the portal's own parser and reading back what it made of it:

| Meaning        | es                                                                       | it                                  | pt                                |
| -------------- | ------------------------------------------------------------------------ | ----------------------------------- | --------------------------------- |
| rent / buy     | `alquiler-` / `venta-`                                                   | `affitto-` / `vendita-`             | `arrendar-` / `comprar-`          |
| homes          | `viviendas`                                                              | `case`                              | `casas`                           |
| offices        | `oficinas`                                                               | `uffici`                            | `escritorios`                     |
| premises       | `locales`                                                                | `negozi`                            | (parser 500s)                     |
| garages        | `garajes`                                                                | `garage`                            | `garagens`                        |
| buildings      | `edificios`                                                              | `edifici`                           | `predios`                         |
| storage rooms  | `trasteros`                                                              | `cantine`                           | `arrecadacoes`                    |
| rooms          | `habitacion`                                                             | `stanze`                            | (parser 500s)                     |
| land           | `terrenos` - parsed as `lands`, which the search endpoint does not serve | `terreni`                           | `terrenos`                        |
| filter segment | `con-`                                                                   | `con-`                              | `com-`                            |
| min/max price  | `precio-desde_N` / `precio-hasta_N`                                      | `prezzo-min_N` / `prezzo_N`         | `preco-min_N` / `preco-max_N`     |
| min/max size   | `metros-cuadrados-mas-de_N` / `-menos-de_N`                              | `dimensione_N` / `dimensione-max_N` | `tamanho-min_N` / `tamanho-max_N` |
| whole province | `-provincia`                                                             | `-provincia`                        | `-distrito`                       |

`arrendar-quartos` and `comprar-lojas` are answered with a 500 by the parser, whichever operation
and place the url names, so what the portal calls those two on the Portuguese site is unconfirmed
and `search-filters.js` deliberately leaves them out. Everything past this table - the tick boxes,
the house shapes, the building conditions - was only ever read off Italian pages, and Fredy's local
table therefore carries them for Italy alone. The portal's own parser reads all of them in every
language anyway, and a url the local table cannot carry over whole is read off the website.

### The ordering none of them may be asked for

Each site names its own "newest first" sort - `ordenado-por=fecha-publicacion-desc`,
`ordine=pubblicazione-desc`, `ordem=atualizado-desc` - and each disallows it:
`www.idealista.it/robots.txt` carries `Disallow:/*?ordine=pubblicazione-desc` and
`www.idealista.com/robots.txt` carries `Disallow:/*?ordenado-por=fecha-publicacion-` (read September
2026; the Portuguese robots.txt is itself behind DataDome and could not be read). Fredy therefore
ships no sort parameter: the api orders by publication date with no such rule against it, and the
website fallback reads every result page rather than the head of a ranking.

## Request signing

Every call carries:

- query parameters `k` (the client key `5b85c03c16bbb85d96e232b112ee85dc`) and `t` (a device id,
  any 16 hex characters, the same for the life of an install)
- headers `User-Agent`, `app_version` and `device_identifier`
- headers `Signature` and `seed`

`seed` is a fresh UUID per request. `Signature` is the lowercase hex of an HMAC-SHA256 over
`seed + METHOD + query + body`, where query and body are each their parameters sorted by name and
joined `name=value&name=value`, url-encoded as `java.net.URLEncoder` does it - a space becomes `+`,
and `* - _ .` are left alone.

The HMAC key is the ASCII string `bXBUUW5TODhKdFhENmQyRQ==`. It looks like base64 and is not: the
app uses those characters verbatim as the key bytes.

A token comes from `POST /api/oauth/token` with
`Authorization: Basic base64(urlencode(clientKey) + ":" + urlencode("idea;andr01d"))` and the form
body `grant_type=client_credentials&scope=write`. It lasts about twelve hours.

## Throttling

The api reads the shape of a caller's traffic on top of its credentials. A caller that fires
requests in bursts, or that calls in with a fresh device id every time, first has its connections
dropped at the edge - no status, the fetch simply fails - and is then answered `407` with a body
that points at the public developers api, signed requests included. The refusal outlives the
single error: it holds for a quarter of an hour or more, during which every request is answered
or dropped the same way.

Two things keep this installation looking like a phone. The device id is minted once per
installation and stored in the settings table (`idealista_device_id`, `lib/services/idealista/
device-id.js`), where it used to be rerolled at every process start. And `call` paces the traffic
(`lib/services/idealista/mobile-api.js`): one request at a time, four hundred milliseconds apart.
After a refusal it stays silent for a quarter of an hour, fails fast inside the silence rather
than knocking again, and doubles the silence every time the refusal outlasts it, up to two hours.

## Paging

A run reads the three first pages of every variant, newest first: plenty for what a search
collects between two runs, since a new advert lands at the head. A variant whose head is deeper
than those three pages - a wide search the job has just been created for - is caught up whole the
first time the process runs its url (twelve pages at most), because an advert skipped once never
comes back: no date field on the advert means the walk cannot stop itself.

## Endpoints

| Path                                                          | Answers                                          |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `POST /api/oauth/token`                                       | a bearer token                                   |
| `POST /api/3.5/<cc>/search`                                   | one page of adverts                              |
| `GET  /api/3.5/<cc>/deeplinks/parse/search`                   | a website url, read into the api's own words     |
| `POST /api/3.5/<cc>/search/locations`                         | one level of the catalogue of locations          |
| `GET  /api/3/<cc>/detail/{code}`                              | one advert, with the dates the search leaves out |
| `GET  https://mt1.idealista.<tld>/19/paths/<cc>/{code}`       | the outline of one area                          |
| `GET  https://mt1.idealista.<tld>/19/tree/all-<cc>-tree.json` | every area code, as a tree                       |

`3.5` is the api version and `<cc>` the country. The advert detail is the one endpoint served under
`3` rather than `3.5`. `19` is the version of the tile set.

### How the accepted values were found

The api names them itself. A parameter sent with a value it does not accept is answered with the
list of the ones it does:

```
{"message":"Invalid value. Accepted values for order are: distance, size, rooms, floor, ratioeurm2,
 price, street, photos, modificationDate, publicationDate, weigh, priceDown,
 preservationTypeAndPrice, privateAds","httpStatus":400}
```

Whether a parameter is read at all is answered by `totalAppliedFilters` in every search response. A
name the api does not know is ignored in silence and leaves that count where it was, which is how
the table below separates the parameters that work from the ones that only look like they do.

## Search

`POST /api/3.5/<cc>/search?adIds=&searchType=...`, form body:

| Parameter                      | Notes                                                                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation`                    | `sale` or `rent`                                                                                                                                                                                                                                                                  |
| `propertyType`                 | `homes`, `bedrooms`, `garages`, `offices`, `premises`, `buildings`, `storageRooms`, `vacationRentals`, `transfers`, `newDevelopments`, `luxury`. There is no type for land                                                                                                        |
| `locationIds`                  | `[id]`, or `[id,id,id]` for several places at once                                                                                                                                                                                                                                |
| `shape`                        | a GeoJSON MultiPolygon, longitude before latitude, with `searchType=drawn`                                                                                                                                                                                                        |
| `order` / `sort`               | `publicationDate` and `desc` put the newest advert first                                                                                                                                                                                                                          |
| `numPage` / `maxItems`         | pages count from one; `maxItems` is capped at 50. Deep pages are served whole - a search of 239 gives 50-50-50-50-39 and an answer with `actualPage: 6` - and the adverts carry no date, so a run reading more than the head cannot tell an old advert from a new one client-side |
| `sinceDate`                    | `T`, `W` or `M` - today, this week, this month                                                                                                                                                                                                                                    |
| `auction`                      | `onlyAuctions` or `excludeAuctions`; the two split a search exactly                                                                                                                                                                                                               |
| `energyEfficiency`             | `high`, `medium`, `low`, and a comma list means their union                                                                                                                                                                                                                       |
| `quality=high`, `gallery=true` | make the answer carry a description and a photo                                                                                                                                                                                                                                   |

`searchType` accepts `aroundMe`, `live`, `drawn`, `locationIds`, `phone`, `freeText` and `zoiId`.

An advert carries `propertyCode`, `price`, `size`, `rooms`, `bathrooms`, `address`, `latitude`,
`longitude`, `description`, `thumbnail`, `url` and its own `locationId`. A figure the advert does
not state arrives as `0`, not as an absent field.

`firstActivationDate` is on every advert **in the fixture** - epoch milliseconds, the moment the
portal published it. The live api has since stopped carrying it: a full search read in September
2026 answered three hundred adverts and not one carried a date, `quality=high` and `gallery=true`
included. What the api still answers is the ordering by `publicationDate` and `modificationDate`;
the values just never travel with the search.

The dates live on the advert's own detail, which is what the android app opens for one advert:

```
GET https://app.idealista.<tld>/api/3/<cc>/detail/<propertyCode>?language=<cc>&quality=high&typology=homes
```

Same host, same token, no further credentials. The answer carries `modificationDate` as both the
epoch milliseconds and the sentence the website prints under them - `{"value": 1788453292000,
"text": "Annuncio aggiornato un'ora fa"}` - and, when the portal states them, `lastActivationDate`
and `lastDeactivationDate` alongside. One request per *new* listing is what a run costs: the
pipeline enriches only what it has not stored yet.

`address` is the line the website prints on a card - "Bilocale in Via Tito Vignoli s.n.c,
Lorenteggio, Milano" - so an advert read through the api and the same advert scraped off a page
describe themselves in the same words.

`?adIds=<propertyCode>` answers with that one advert, but only when `operation` and `propertyType`
match it as well, so an advert cannot be looked up by its code alone. Nor can it be looked up on the
wrong country's api: a code is only known to the site that issued it.

## The website's filters, and the api's

The website hides every filter in one path segment, `con-prezzo_450000,ascensori`. The vocabulary
was read off a rendered search page, where each filter is a link, and each mapping was then
confirmed against the api. `lib/services/idealista/search-filters.js` holds the table.

**The first translator is the portal's own.** The app opens an idealista link by handing the url
to `GET /api/3.5/<cc>/deeplinks/parse/search?url=...&locale=<cc>` and reading back the search in the
api's own words: every filter named, a `/multi/` url's codes resolved to their location ids, a
drawn url's polygon decoded into the GeoJSON. One request replaces the whole local translation,
and no website filter can lack a counterpart - `giardino-privato` arrived as `privateGarden` this
way, a name no rendered page ever spelled out. Two of the answer's fields are legacy copies
(`preservation` holding the first of `preservations`' values, a `newDevelopment` boolean) and are
dropped. The parser names no place for a slug url, so the place of a named search is resolved
locally as before. Fredy asks the parser first and falls back to the local table.

The parser's reading of the "Appartamenti" box is `flat=1` alone, and that is the website's own
semantics: every penthouse and two-level flat answers a `flat=1` search already - walking the two
searches and diffing the property codes found zero outside the flat's answer - so the box is one
search, not three. The houses' `subTypology` rides beside the `flat` in the same request, whose
answer is their union (291 + 34 = 325, measured). What the search does refuse is two *flat* shapes
in one body: `flat=1&penthouse=1` answers what `flat=1` answers, the second boolean ignored - an
attic asked for on its own is its own search.

Two of the website's names are traps. `con-prezzo_N` is the **maximum** price, not the minimum -
its links sit in the dropdown whose placeholder is "Max" - while `con-dimensione_N` is the
**minimum** size and `con-dimensione-max_N` the maximum. The minimum price is `con-prezzo-min_N`.

`bedrooms` counts what the website calls "locali", the same figure the advert reports as `rooms`:
`con-bilocali-2` is `bedrooms=2`, and an advert answering it reports `rooms: 2`. The top value of
`bedrooms` and of `bathrooms` means "or more", as the website's own labels say.

Filters with no counterpart in the api, which is why the url carrying one is read off the website
instead:

- `terrazza-e-balcone`. The box means their union, and the api takes `terrance` and `balcony` as
  two searches' worth of conditions.
- the letting terms.

`aste_no` is `auction=excludeAuctions`. The energy boxes map to `energyEfficiency` - `high`,
`medium`, `low` - a parameter the android app never sends (no field of it exists in the app) but
the search endpoint reads as a comma list meaning their union. The terrace box is `terrance`, the
app's own spelling of the word; `terrace` is ignored in silence. The private-garden box is
`privateGarden`, which the parser names and the search honours.

`preservations` (plural) is the parameter the app sends: a comma list whose values are `good`,
`renew` and `newDevelopment` - the last in camel case, where the singular `preservation` takes the
lowercase `newdevelopment` the website's url spells. The list is read as their union, but it is a
shade wider than running the singular once per value: 324 against the split's 321 on the reference
search below. Fredy's fallback keeps the singular split for that reason; the parser path sends the
list, because it is what the portal itself would run for the url.

`typologies`, which the app's saved-search objects carry as `flats` and `housesOrChalets`, is
ignored by the search endpoint in silence - it answers whatever the rest of the body asks for,
without narrowing to the named types.

`subTypology` names the shape of a house: `independantHouse`, `semidetachedHouse`, `terracedHouse`,
`villa` and a long tail of regional ones. It is only read when `chalet` is **not** sent; with
`chalet=1` in the same body it is ignored and the search widens to every house - which is why the
two never travel together, the shapes being separate searches whose answers merge.

## Locations

`POST /api/3.5/<cc>/search/locations` answers with the ancestors of the location it is asked about
and its children, under the keys `provinces`, `municipalities`, `districts` and `neighborhoods`. It
needs one of `locationIds`, `center`, `shape`, `freeText` and a few others, so the list of provinces
is read by opening some location and taking the `provinces` it comes with. A province with no
advert of the kind asked for is left out of the answer.

An italian location id reads `0-EU-IT-<province>-<zone>-<group>-<municipality>-<district>-
<neighborhood>`, and the other two countries the same with their own code: `0-EU-ES-28-07-001-079`
is Madrid, `0-EU-PT-11-06` Lisboa. A name is qualified with the place above it - `Abbiategrasso,
Milano` - and the url spells it without that qualifier at every level below the municipality, so
both spellings are matched.

The list of provinces is read by opening one location per country, which `portal.js` calls the
province anchor: `0-EU-IT-MI`, `0-EU-ES-28`, `0-EU-PT-11`. Spain spells a whole province the way
Italy does (`madrid-provincia`); Portugal names a district without repeating it
(`/comprar-casas/lisboa/`) and spells the whole district `lisboa-distrito`, which the parser
answered as `0-EU-PT-11`.

The **zone** - `0-EU-IT-BS-02`, "Sebino-Franciacorta" - is a real location that can be searched, and
the catalogue does not list it: it goes from a province straight to its municipalities. A zone id is
the five-segment prefix of any municipality id, and a search for it answers with its name in
`searchTitle`.

A zone has no url of its own. `https://www.idealista.it/vendita-case/sebino-franciacorta-brescia/`
is a 404.

## A search drawn on the map

An area the user draws by hand is an `/aree/` url. It names no place: the polygon travels in the
query string, as encoded polyline rings in parentheses - `?shape=((qwnuG...))` - the same encoding
the tile host serves borders in. The api takes it decoded, as the GeoJSON MultiPolygon of a
`searchType=drawn` search.

The website pages a drawn search without the `.htm` every other search carries -
`/aree/vendita-case/lista-2?shape=...`. Asked as `lista-2.htm`, the portal answers a page with no
adverts on it rather than an error.

## Areas, and the codes that name them

A search over several areas at once is a `/multi/` url, and it names each area in a code of three
characters: `/multi/vendita-case/a5W,a7j,aR0,dJY/`.

**There is no map from a code to a name.** The codes are row numbers in a table only idealista
holds. They are not in the api's catalogue, not in the markup of the page they address, and they
encode nothing - `dJo` and `dJr` are the province and the city of Brescia, `dJV` a quarter of it,
and neighbouring numbers are unrelated places elsewhere.

Two sources on the website hold the map, and neither can be harvested:

- `GET /{lang}/multizoneSearcherLocationsSuggestion?searchField=<text>&operation=1&typology=1`,
  which the area picker calls. It answers `{name, count, category, shortUri, parentName}` per
  match, where `shortUri` is the code and `category` is `Provincia`, `Area`, `Comune` or
  `Quartiere`. It matches on text, answers at most ten, and is behind DataDome.
- any rendered search page, which carries its own codes already resolved, as
  `"geo":{"type":"multiZone","locationId":[...]}`.

`https://mt1.idealista.it/19/tree/all-it-tree.json` lists every Italian code - 110 provinces and 14190
nodes - as a tree of `{id, children}`. It carries no names, and its children are ordered by
idealista's internal id rather than by name, so it says which codes exist and not what they are.

### How a code is resolved anyway

Without asking the website, and exactly:

1. `GET https://mt1.idealista.<tld>/19/paths/<cc>/{code}` answers with the border of the area, as encoded
   polylines - the format google maps draws with - grouped by parentheses, `((ring)(ring))`.
2. Search that border as a `shape`. Every advert inside it carries the `locationId` of the location
   it belongs to, and the id all of them share is the location the code stands for.
3. Confirm it: the total for that location and the total for the border have to agree.

The confirmation is what makes the third step safe, because a sample can sit in one corner of a
large area. The border alone is a slightly different search - it catches a few neighbours whose
coordinates fall on the wrong side of a line, and it misses adverts the portal placed by address
rather than by point - so it is used only where a code cannot be named at all.

`lib/services/idealista/zones.js` does this, and caches it: a border does not move.

## Transport notes

- The edge in front of `app.idealista.<tld>` answers **HTTP/2 requests with a bare `406`** and an
  empty body - no status from the api itself, just the proxy (`via: varnish`). Node's fetch and
  every HTTP/1.1 client get through; a curl that negotiates h2 does not, which matters only when
  probing by hand (`curl --http1.1`). Fredy's fetch is HTTP/1.1 and unaffected.
- The api reads no Play Integrity attestation: the app calls a Play-Protect endpoint of its own,
  and disabling it changes nothing about the api's answers. The signed request is the whole proof.

## Numbers to check a change against

A drawn search whose url is
`/aree/vendita-case/con-prezzo_300000,appartamenti,case-indipendenti,villette-bifamiliari,
villette-a-schiera,ville-indipendenti,trilocali-3,quadrilocali-4,5-locali-o-piu,nuova-costruzione,
buono-stato,aste_no,alta-efficienza,media-efficienza/?shape=...` - the polygon of a lake district
in Lombardy - is reported by the website as **321** adverts. The parser reads it as `flat=1` with
the four house shapes' `subTypology` beside it and `preservations=good,newDevelopment`, which is
one request, and that request's walk answers the same 321 distinct adverts. The older reading - the
singular `preservation` split once per condition, four searches - answers the same 321.

A `/multi/` search over five area codes around Lago d'Iseo (`a5W,a6c,a7j,ceC,dJY`) with
`con-prezzo_330000,dimensione_80,appartamenti,case-indipendenti,villette-bifamiliari,
villette-a-schiera,ville-indipendenti,quadrilocali-4,5-locali-o-piu,nuova-costruzione,buono-stato,
aste_no,alta-efficienza/` is reported by the website as **300** adverts. The parser resolves the
five codes to their location ids - the last of them, `dJY`, is `0-EU-IT-BS-02`, "Sebino-Franciacorta",
which the local sampling of borders cannot name because its adverts' ids disagree at the zone
level - and the search by those ids answers the same 300.
