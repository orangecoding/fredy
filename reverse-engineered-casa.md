# Reverse Engineered Casa.it

Casa.it is one of the three national portals Italian agencies publish to. Its website sits behind
DataDome; the api its android app talks to does not. This file records what was measured about that
api, and about the website's own url grammar, which is what a Fredy job holds.

The provider is `lib/provider/casa.js`. The translation from a website search url into a search the
api answers is in `lib/services/casa/`.

## Hosts

| Host                   | Serves                                                                         | Protected |
| ---------------------- | ------------------------------------------------------------------------------ | --------- |
| `esapi.casa.it`        | the search: `POST /listings/v2/search`, and `/listings/v2/search_map` for pins | no        |
| `smartsuggest.casa.it` | place lookup by name                                                           | no        |
| `api-lh.casa.it`       | the location hierarchy: zones of a town, reverse geocoding                     | no        |
| `images-1.casa.it`     | the photos                                                                     | no        |
| `www.casa.it`          | the website                                                                    | DataDome  |

The static assets under `www.casa.it/portal-srp/` are reachable without clearing the wall, which is
where the filter table below comes from.

## The search

```
POST https://esapi.casa.it/listings/v2/search
content-type: application/json
```

No key, no token, no signature, no cookie. `content-type` is the only header it needs.

```json
{"site": "it_casa", "page": 1, "size": 50, "sort": ["date-desc"],
 "query": [{"where": [...], "filters": {...}, "modifiers": {}}]}
```

`size: 0` answers with the total and no adverts, which is what makes a count cheap. The app asks for
20 and the website for 50. `data.total` is the count; the adverts are in `data.tiers[]`, under the
entry whose `tier` is `listings`.

`sort` takes `date-desc` - the api reads it as `inserted|desc` - and puts the newest advert first.
The rendered page offers no such order, which is the main reason to prefer the api.

### It never says no

This api does not refuse what it does not understand, and that shapes the whole design:

- An unknown filter name is dropped in silence. The search then runs without it.
- An unknown `property_type_group` answers with the residential one rather than with an error.
- An unknown `sort` token answers in the api's own order.
- A geo shape it does not know - `geo.bbox`, `geo.bounding_box` with point pairs, an `envelope` -
  answers with the whole country rather than with an error.
- A filter sent as a list where one value is wanted - or the other way round - answers with a bare
  21-byte "Internal Server Error", with no JSON and no message.

That last refusal is what makes a filter name provable: a *known* name sent in the wrong shape
answers the bare error, an unknown one is dropped and the total does not move. Every name in the
table below was confirmed that way, and then confirmed again by watching it move the total of a
known search - Roma is big enough that a flag which does nothing shows immediately.

So the provider translates only what is in its table and renders the page for anything else. An
endpoint that refuses what it dislikes and names the field can be handed parameters it was never
taught, and the answer says whether they were understood. This one cannot be trusted that way: it
takes an unknown filter, says nothing, and answers a search wider than the one that was asked for.

A handled failure does answer usefully: a 500 carrying the raw python exception and the body it was
sent. That is worth reading when something breaks.

### The request modifiers

The site's own request carries a `modifiers` object next to `filters`. Only one of them changes
which adverts a search answers with, and it is the one a url asks for:

| url              | modifier                                     |
| ---------------- | -------------------------------------------- |
| `surrounding=true` | `with_surroundings: true` - reach past the place's own border (measured: Roma 37057 → 44241) |

The rest - `with_poi`, `with_georeach`, `geo_boolean_op`, `autoexpand_location_polygon` - shape the
answer's decorations, not its contents, and are left out.

## Where to search

Three forms, all confirmed:

| Form         | Written as                                          |
| ------------ | --------------------------------------------------- |
| a place      | `{"hkey": "a0d22860", "level": 9}`                  |
| a drawn area | `{"geo": {"polygon": [[lon, lat], ...]}}`           |
| a circle     | `{"geo": {"center": [lat, lon], "distance": 6970}}` |

`where` is a list and it means **or**: Roma 27891 plus Erbusco 153 answers 28044 for the two
together, so a url naming several places translates.

**The polygon is [lon, lat], the opposite of the url.** A search url writes its ring as
`geopolygon={"polygon":[[lat,lon],...]}`. Sent in that order the api answers 0 - it applies the
shape and matches nothing - which reads exactly like a search with no results. The centre of a
circle, confusingly, is [lat, lon].

`{"polygon": ...}`, `{"geo_shape": ...}` and `{"geo": {"geo_shape": ...}}` are all ignored in
silence and answer with the whole country.

The website's own pages use a fourth form, `{"seo": {"l9": {"adm": "roma"}}}`, which resolves a slug
at a named level without a lookup. It is not used here because the lookup answers the level as well,
and the level is the part a url does not state.

### The place lookup

`GET https://smartsuggest.casa.it/smartsuggest/v1/suggest/?query=<words>&site=it_casa`

The results are under `data.results`, and each carries `{id, hkey, level, name, slugs, type}`.
`slugs` is a string despite its name. Levels: 2 country, 4 region, 6 province, 9 town, 10 zone,
11 subzone.

**`hkey` is required and `id` is not accepted.** Sent as `{"id": "IT-LAZ-058091", "level": 9}` the
search answers 942851 - the whole country - with a first result from Abruzzo. The id is ignored,
not refused.

A name matches several levels: Roma is a province and the town in it. The url's grammar says which
is meant, so the level is chosen rather than ranked.

## Reading a url

The website writes a search in two shapes.

A **town search** says everything in its path: `/affitto/residenziale/roma/` is the contract, the
category and the place. `residenziale` becomes `property_type_group: "case"` - confirmed against the
page's own request, which the store carries as `apireq`, and against its total of 3701.

A **drawn search** says everything in its query string, at `/srp/map/`.

### What the site itself asks for a drawn search

The store of a drawn search carries the `apireq` the page sent, and it is not what the url
suggests. For `/srp/map/?geobounds={"bbox":...}&q=276e3467` the site asks for:

```json
{"where": [{"hkey": "276e3467"}], "filters": {...}, "modifiers": {...}}
```

No box, no polygon: the drawn shape never reaches the api. The shape is the map's business - the
pins inside it are filtered client-side - and the list the page reads is the whole area the `q`
names. `q` is an hkey, the place the drawing sits in, and the api takes it without a level.

Fredy asks for what was drawn, not for the map's convenience: a drawn polygon is sent as the
polygon, and the api answers it (that form is confirmed under *Where to search*). A drawn box has
no api shape of its own - `geo.bbox`, `geo.bounding_box` and the GeoJSON envelope all answer with
the whole country - so the box is sent as the rectangle it is. A drawn circle keeps the centre the
url already carries, `[lat, lon]`, the one pair that is not swapped. And a drawn search whose shape
cannot be read falls back to the `q` hkey, which is exactly what the site itself would have asked
for, rather than to the browser.

### The filters

Casa.it ships the converter that writes these urls, in `/portal-srp/common-*.js`. The table in
`lib/services/casa/search-filters.js` is that mapping read backwards, and then confirmed against
the api itself as described above:

| url                                        | api                                        |
| ------------------------------------------ | ------------------------------------------ |
| `tr`                                       | `transaction.type`                         |
| `propertyTypeGroup`                        | `property_type_group`                      |
| `category`                                 | `property_type_group` (`residenziale` → `case`) |
| `propertyTypes`                            | `property.types`                           |
| `priceMin` / `priceMax`                    | `price.gte` / `price.lte`                  |
| `mqMin` / `mqMax`                          | `surface.gte` / `surface.lte`              |
| `numRoomsMin` / `numRoomsMax`              | `rooms.gte` / `rooms.lte`                  |
| `numRooms`                                 | `rooms` with both ends set to the figure   |
| `numBaths`                                 | `bathrooms.gte` - the api calls them bathrooms, not baths |
| `mqpriceMin` / `mqpriceMax`                | `mqprice.gte` / `mqprice.lte`              |
| `paymentMin` / `paymentMax`                | `payment.gte` / `payment.lte`              |
| `buildingYearMin` / `buildingYearMax`      | `building_year.gte` / `building_year.lte`  |
| `numParkingSpaces`                         | `carparks.gte`                             |
| `buildingCondition`                        | `building_condition`                       |
| `garden`                                   | `garden.type`                              |
| `heatingType`                              | `heating.types`                            |
| `energyClass`                              | `energy_class`, one value only             |
| `publication_date` (`2d` / `7d` / `30d`)   | `publication_date`, one value only         |
| `sellerType`                               | `publisher`                                |
| `photo`                                    | `only_with_photos`                         |
| `pId`                                      | `publisher.id`                             |
| `rentType`                                 | `rent_type`                                |
| `level` (`piano terra`, `intermedio`, `3`) | `level`, one value only                    |
| `availability`                             | `availability`                             |
| `furniture`                                | `furniture`                                |
| `license_type_groups`                      | `license_type_groups`                      |
| `zones`                                    | `zone`, a list of hkeys                    |
| `balconyAndTerrace` (`balcone`, `terrazzo`) | `balcony: true` / `terrace: true`          |
| `exclude_auction`                          | `exclude_auction`                          |
| `only_auction`                             | `only_auction`                             |
| `is_auction`                               | `true` → `only_auction`, `false` → `exclude_auction` |
| `exclude_private_negotiation`              | `exclude_private_negotiation`              |
| `only_private_negotiation`                 | `only_private_negotiation`                 |
| `exclude_under_construction`               | `exclude_under_construction`               |
| `has_swimming_pool`                        | `has_swimming_pool`                        |
| `has_reception`                            | `has_reception`                            |
| `has_virtual_tour`                         | `has_virtual_tour`                         |
| `air_conditioned`                          | `air_conditioned`                          |
| `is_lux`                                   | `is_lux`                                   |
| `includes_property_ownership`              | `includes_property_ownership`              |
| `terrace`                                  | `terrace`                                  |
| `lift`                                     | `lift`                                     |

The boolean names are the same on both sides - the converter writes the api's own words into the
url. On a measured day Roma vendita carried 3935 auctions and 391 private-negotiation adverts, and
each pair excluded and only summed exactly to the unfiltered total, which is as clean a
confirmation as a live catalogue offers.

Two url parameters carry no filter and are dropped without losing anything: `isRoomsNumber`, which
tells the site how to *render* the room count, and the trackers campaigns append (`utm_*`, `at_*`,
`gclid`, `t`, ...). `ft`, the free-text search, has no counterpart this api answers to and stays
untranslated, so a url carrying it is still read off the website.

### The level, decoded

Every multi-word value in the table reaches the api in the site's own encoding - spaces as `+` -
and matches. The level is the one exception: `piano+terra` is refused with a bare 500, `piano
terra` answers. Measured, not assumed; it is why the level is written through its own helper.

### The encoding trap

The website encodes a value with an encoder of its own, in the same bundle: accents stripped, an
apostrophe turned into a space, a **space turned into `+`**, a comma into `%2C`. Whatever comes out
of that is fed to the api verbatim.

So a value must be taken from the url **undecoded**. A list is split on `%2C`, and the `+` inside an
item stays where it is:

```
propertyTypes=casa+indipendente%2Cvilla%2Cvilletta+a+schiera
-> "property.types": ["casa+indipendente", "villa", "villetta+a+schiera"]
```

Decoding it the ordinary way gives `"casa indipendente"`, which matches nothing, and the api says
nothing about it. On one measured search the correct form answers 144 and the decoded form answers
61 - the 61 being the villas, the only item whose name has no space in it.

## An advert

| Field       | Path                                                  |
| ----------- | ----------------------------------------------------- |
| id          | `listing_id`                                          |
| title       | `title.it`                                            |
| price       | `transaction.price.value`                             |
| surface     | `property.characteristic.property_surface`            |
| rooms       | `property.characteristic.rooms_count`                 |
| address     | `property.geo.street`, `.district_name`, `.city`      |
| coordinates | `property.geo.lat`, `.lon`                            |
| photo       | `media.items[].uri`, under `https://images-1.casa.it` |

The listing's page is `https://www.casa.it/immobili/<listing_id>/`, which is the form the website's
own store uses. The api also offers `meta.links.pretty.href`, which is not needed.

There is no publication date on the advert. What the api stamps it with is the last edit -
`modified`, with `last_relevant_update` alongside - in a compact UTC form (`20260826T003616Z`),
which is what the site's own "aggiornato il" reads. Fredy keeps the later of the two and orders by
it. The rendered store carries neither stamp, so a search read off the website has no date to give.

## Numbers to check a change against

- `/affitto/residenziale/roma/` - 3701, the figure the page itself reports.
- The drawn search over Franciacorta for `casa+indipendente,villa,villetta+a+schiera` between
  200000 and 450000, at least 80 m2, at least 3 rooms, `abitabile` - **144**. Without the property
  types it is 359, which is what the encoding trap costs if the values are decoded.
- Roma level 9 (`hkey a0d22860`): 37285 all contracts, 27891 sale, 9395 rent.
