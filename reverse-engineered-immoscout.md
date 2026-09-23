# Reverse Engineered Immoscout24's Mobile API

## What is Immoscout24?

Immobilienscout24 (commonly known as Immoscout) is one of Germany's largest and most popular real estate platforms. It serves as a marketplace where property owners, real estate agents, and property management companies can list apartments, houses, and commercial properties for rent or sale. For people searching for a new home in Germany, Immoscout is often one of the first platforms they check.

The platform allows users to filter properties based on various criteria such as location, price, size, number of rooms, and additional features like balconies or built-in kitchens. Immoscout24 is available both as a website and as a mobile application, making it accessible across different devices.

## Why do we do this?

Crawling Immoscout24 the oldschool way has become virtually impossible due to their extensive bot detection mechanisms. Immoscout has implemented various anti-scraping measures to prevent automated access to their platform. These measures can include:

1. IP-based rate limiting
2. Browser fingerprinting
3. CAPTCHA challenges
4. Behavior analysis to detect non-human patterns
5. JavaScript-based challenges that must be solved before content is displayed

These protections make it extremely difficult to reliably extract data from Immoscout using conventional web scraping approaches. Even with techniques like rotating proxies or mimicking human behavior, the bot detection systems have become increasingly effective at identifying and blocking automated access attempts.

## Mobile API Reverse Engineering

To work around these limitations, we are in the progress of reverse-engineering Immoscout24's mobile API. The mobile applications need to communicate with Immoscout's servers to retrieve listing data, and these API endpoints typically have fewer anti-bot protections than the web interface.

The mobile API provides several key endpoints:

- Search total endpoint: Returns the total number of listings for a given query
- Search list endpoint: Retrieves the actual listings with details
- Expose endpoint: Returns detailed information about a specific listing

Challenges:

1. Identifying the necessary endpoints and parameters required to perform searches
2. Mapping the mobile API parameters to their web counterparts to maintain compatibility with existing search URLs

### One API, several national sites

The host is German and so is every endpoint below, but the index behind it is not. Austrian
listings are syndicated into it and are reached by prefixing the geocode with `/at` instead of
`/de`. Nothing else about a request changes: same host, same user agents, same response shape,
same numeric ids, same German attribute labels.

| geocode | `apartmentrent` |
|---|---:|
| `/at` | 10606 |
| `/at/wien/wien` | 3043 |
| `/at/steiermark/graz` | 1407 |

Not every type carries Austrian inventory. `apartmentrent`, `apartmentbuy`, `houserent`,
`housebuy` and `livingbuysite` do; `flatshareroom`, `garagerent`, `garagebuy`, `investment`,
`shorttermaccommodation`, `assistedliving` and `compulsoryauction` answer 200 with zero results.

An Austrian exposé states `www.immobilienscout24.de/expose/{id}` as its **own** share link, so the
German page is where the advert lives. The Austrian website's `/expose/{24 hex}` ids are a separate
identifier space that this API does not know.

**Switzerland is not in this index.** `/ch`, `/ch/zuerich` and `/ch/bern` answer 200 with zero
results, `/ch/zurich/zurich` and `/ch/geneve` answer 412. `immoscout24.ch` belongs to a different
company running a different platform and shares nothing with this API.

## Api Specs

#### Search for Listings

`GET /search/total?{search parameters}`  
_Returns the total number of listings for the given query._

```
curl -H "User-Agent: ImmoScout_28.1_26.5.2_._" \
     -H "Accept: application/json" \
     "https://api.mobile.immobilienscout24.de/search/total?searchType=region&realestatetype=apartmentrent&pricetype=calculatedtotalrent&geocodes=%2Fde%2Fberlin%2Fberlin"
```

---

#### Retrieve the listings

`POST /search/list?{search parameters}`  
_The body is json encoded and contains data specifying additional results (advertisements) to return. The format is as follows (It is not necessary to provide data for the specified keys.)_

```
{
"supportedResultListTypes": [],
"userData": {}
}
```

```
curl -X POST 'https://api.mobile.immobilienscout24.de/search/list?pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&pagenumber=1' \
  -H "Connection: keep-alive" \
  -H "User-Agent: ImmoScout_28.1_26.5.2_._" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"supportedResultListType":[],"userData":{}}'

```

---

#### Get details of listings

`GET /expose/{id}`
The response contains additional details not included in the listing response.

```
curl -H "User-Agent: ImmoScout_28.1_26.5.2_._" \
     -H "Accept: application/json" \
     "https://api.mobile.immobilienscout24.de/expose/158382494"
```

## Parameters

A user pastes a **web** search URL into Fredy, and the mobile API needs a different one. Two things make that more than a rename, and both are documented below: filters that hide in the URL path, and parameters that only exist for some real estate types.

The translation lives in `/lib/services/immoscout/`, split so that extending it means editing one table:

| File | Holds | Edit it when |
|---|---|---|
| [`web-paths.js`](https://github.com/orangecoding/fredy/blob/master/lib/services/immoscout/web-paths.js) | what a path segment means on the German site, plus the per-type defaults | ImmoScout adds or retires a search path |
| [`at-paths.js`](https://github.com/orangecoding/fredy/blob/master/lib/services/immoscout/at-paths.js) | the same for the Austrian site, plus its own query parameter vocabulary | the Austrian site adds or retires a search path or a filter |
| [`param-support.js`](https://github.com/orangecoding/fredy/blob/master/lib/services/immoscout/param-support.js) | which parameter each type accepts, and the dropping | a filter is new, or a type starts/stops accepting one |
| [`real-estate-types.js`](https://github.com/orangecoding/fredy/blob/master/lib/services/immoscout/real-estate-types.js) | the `realestatetype` vocabulary and its groupings | a new real estate type shows up |
| [`shape.js`](https://github.com/orangecoding/fredy/blob/master/lib/services/immoscout/shape.js) | the `shape` parameter of a drawn area | the shape encoding changes |
| [`immoscout-web-translator.js`](https://github.com/orangecoding/fredy/blob/master/lib/services/immoscout/immoscout-web-translator.js) | URL assembly: resolve path, anchor location, apply precedence | the URL shape itself changes |

Each has its own test file under `test/services/immoscout/`. The translator test additionally replays the whole catalogue of known paths against the live mobile API (skipped in `TEST_MODE=offline`), which is the only thing that notices when ImmoScout retires a path or changes what a type accepts.

### How the tables below were obtained

Nothing here is guessed from the German wording. Two oracles were used:

1. **The web app tells you what a path means.** Every ImmoScout search page embeds the search it resolved to in a `lastSearchApiUrl` field, using the same parameter names the mobile API uses:

   ```
   /Suche/de/nordrhein-westfalen/duesseldorf/haus-mit-garage-kaufen
     -> "lastSearchApiUrl":"/region?realestatetype=housebuy&equipment=parking&..."
   ```

   A path ImmoScout does not serve answers **410 Gone**, which is how you tell a real slug from an invented one.

2. **The mobile API tells you what it accepts.** Every parameter was replayed against `search/total` for every real estate type and the result recorded (accepted, or rejected with 412).

### Real estate types

The last path segment of a web URL names the type. These are the ones Fredy supports:

| Web path | `realestatetype` |
|---|---|
| `wohnung-mieten` | `apartmentrent` |
| `wohnung-kaufen` | `apartmentbuy` |
| `haus-mieten` | `houserent` |
| `haus-kaufen` | `housebuy` |
| `anlageimmobilie` | `investment` |
| `grundstueck-kaufen` | `livingbuysite` |
| `garage-kaufen` / `garage-mieten` | `garagebuy` / `garagerent` |
| `wg-zimmer` | `flatshareroom` |
| `wohnen-auf-zeit` | `shorttermaccommodation` |
| `seniorenwohnen` | `assistedliving` |
| `zwangsversteigerung` | `compulsoryauction` |

Two paths name **several types at once** - the "Alle Immobilien" searches - and the mobile API takes them as a comma separated list:

| Web path | `realestatetype` |
|---|---|
| `immobilie-kaufen` | `apartmentbuy,housebuy` |
| `immobilie-mieten` | `apartmentrent,houserent` |

For such a search the API judges the two halves of a parameter differently. The **name** only has to be accepted by one of the types - `immobilie-kaufen?apartmenttypes=penthouse` answers 200 and narrows the apartments while leaving the houses alone - but the **value** has to hold for every type that takes the parameter: `immobilie-mieten?pricetype=calculatedtotalrent` answers 412, because `houserent` has no "Warmmiete". Neither does the combined rent search carry the `swapflat` default that `wohnung-mieten` has; the website sends none either.

The commercial types (`office`, `store`, `gastronomy`, `tradesite`, `specialpurpose`, reachable via `buero-mieten`, `gastronomie-mieten`, `bauernhof-kaufen`, ...) are **deliberately not supported**: their `search/list` answers contain no `EXPOSE_RESULT` items, so there is nothing for the provider to read.

### Filters hidden in the path (SEO slugs)

When a search carries exactly one filter, the web UI writes it into the path instead of the query string. Buying a house with a garage is `haus-mit-garage-kaufen`, **not** `haus-kaufen?equipment=parking`, and the path is the only place that filter appears. Translating such a path therefore has to restore the parameter, and a path that is not recognised has no real estate type at all.

Slugs come in three shapes:

**Symmetric slugs**, registered for both `-mieten` and `-kaufen`:

| Base slug | Resolves to |
|---|---|
| `souterrainwohnung`, `erdgeschosswohnung`, `hochparterrewohnung`, `etagenwohnung`, `loft`, `maisonette`, `terrassenwohnung`, `penthouse`, `dachgeschosswohnung` | `apartmenttypes=halfbasement` / `groundfloor` / `raisedgroundfloor` / `apartment` / `loft` / `maisonette` / `terracedflat` / `penthouse` / `roofstorey` |
| `wohnung-mit-garage`, `wohnung-mit-einbaukueche`, `wohnung-mit-keller`, `wohnung-mit-balkon`, `wohnung-mit-garten` | `equipment=parking` / `builtinkitchen` / `cellar` / `balcony` / `garden` |
| `barrierefreie-wohnung` | `equipment=handicappedaccessible` |
| `neubauwohnung` | `newbuilding=true` |
| `altbauwohnung`, `wohnung-von-privat` | `fulltext=altbau` / `fulltext=privat` |
| `einfamilienhaus`, `doppelhaushaelfte`, `reihenhaus`, `bungalow`, `mehrfamilienhaus`, `bauernhaus`, `villa` | `buildingtypes=singlefamilyhouse` / `semidetachedhouse` / `terracehouse` / `bungalow` / `multifamilyhouse` / `farmhouse` / `villa` |
| `haus-mit-garage`, `haus-mit-keller` | `equipment=parking` / `cellar` |
| `neubauhaus` | `newbuilding=true` |

**One-sided slugs**, published for one side of the market only (the counterpart answers 410):

| Slug | Resolves to |
|---|---|
| `luxushaus-kaufen`, `luxuswohnung-kaufen` | `luxurypromotion=true` |
| `guenstiges-haus-kaufen`, `guenstige-wohnung-kaufen` | `price=-100000.0` |
| `guenstige-wohnung-mieten` | `price=-400.0&pricetype=rentpermonth` |
| `studentenwohnung-mieten` | `price=-350.0&pricetype=rentpermonth` |
| `moeblierte-wohnung-mieten` | `fulltext=möbliert` |
| `provisionsfreies-haus-kaufen`, `provisionsfreie-wohnung-kaufen` | `freeofcourtageonly=true` |
| `haus-bauen` | `newhomebuilder=true` |
| `besondere-immobilien` | `buildingtypes=specialrealestate` |
| `wohnung-kaufen-mit-balkon`, `eigentumswohnung-mit-garten` | `equipment=balcony` / `garden` |
| `bestandswohnung-mieten` | `exclusioncriteria=swapflat,projectlisting` |
| `mietwohnungen-mit-tauschwohnungen` | no exclusion at all |

**Generated slugs**, built from a number:

| Pattern | Resolves to |
|---|---|
| `1-zimmer-wohnung-…` … `5-zimmer-wohnung-…` | `numberofrooms=N.0-N.5` |
| `6-zimmer-wohnung-…` | `numberofrooms=6.0-` (open ended; seven and up answer 410) |
| `wohnung-bis-<N>-euro-warm` | `price=-N&pricetype=calculatedtotalrent` |

There is **no** `haus-bis-<N>-euro-warm`: the website answers 410 and the mobile API rejects `calculatedtotalrent` for `houserent`.

Note that `altbauwohnung` and `moeblierte-wohnung` also make the website send `semanticquery` alongside `fulltext`. It is not worth copying: for "altbau" in Düsseldorf, `semanticquery` alone leaves 1000 of 1072 listings while the full text search leaves 67, and combining the two changes nothing.

### Which parameter works with which type

The mobile API validates parameters **per real estate type**. Sending one that does not belong answers `412` with `ERROR_COMMON_URL_PARAMETER_NOT_SUPPORTED`, an unknown value answers `412` with `ERROR_COMMON_URL_PARAMETER_VALIDATION_FAILED`, and either way the search returns nothing at all. Unsupported parameters are therefore dropped before the request rather than forwarded.

| Parameter | Accepted for |
|---|---|
| `exclusioncriteria`, `osmtags`, `fulltext`, `semanticquery`, `tenantNetwork`, `sorting`, `publishedafter` | every type |
| `price`, `freeofcourtageonly` | every type except `assistedliving`, `compulsoryauction` |
| `energyefficiencyclasses`, `minimuminternetspeed` | every type except `livingbuysite`, `garagebuy`, `garagerent`, `assistedliving` |
| `equipment` | `apartmentrent`, `apartmentbuy`, `houserent`, `housebuy`, `flatshareroom`, `shorttermaccommodation`, `assistedliving` |
| `petsallowedtypes` | `apartmentrent`, `houserent`, `flatshareroom`, `shorttermaccommodation`, `assistedliving` |
| `livingspace` | `apartmentrent`, `apartmentbuy`, `houserent`, `housebuy`, `flatshareroom` |
| `numberofrooms` | `apartmentrent`, `apartmentbuy`, `houserent`, `housebuy`, `shorttermaccommodation` |
| `constructionyear`, `heatingtypes`, `newbuilding` | `apartmentrent`, `apartmentbuy`, `houserent`, `housebuy` |
| `pricetype` | `apartmentrent`, `houserent` |
| `apartmenttypes`, `floor` | `apartmentrent`, `apartmentbuy` |
| `buildingtypes`, `ground` | `houserent`, `housebuy` |
| `luxurypromotion`, `rented` | `apartmentbuy`, `housebuy` |
| `haspromotion` | `apartmentrent` |
| `constructionphasetypes`, `newhomebuilder` | `housebuy` |

A dropped filter is still a filter the user set and did not get, so every drop is logged and the two reasons are worded differently:

```
WARN: ImmoScout: dropping query parameter "haspromotion=true", not supported for housebuy.
WARN: ImmoScout: no translator for query parameter "listingtags=holzbalken" (apartmentrent), the filter is ignored.
      Please report the search URL at https://github.com/orangecoding/fredy/issues so it can be added.
```

The first is expected and needs no action: ImmoScout itself does not offer that filter for that type. The second is a **gap in the table above** - a filter ImmoScout has that Fredy does not know yet - and the log line is the only place it can surface, which is why it names the parameter verbatim. Only the website's own tracking and paging noise (`enteredFrom`, `centerofsearchaddress`, `pagenumber`, `pagesize`, `searchId`, `referrer`, `utm_*`, `cmp_*`) is discarded without a word.

Known gap at the time of writing: `listingtags` is a real web parameter that the mobile API accepts for every type, but every value tried against it returned zero results, so the two vocabularies evidently differ. Forwarding it would turn a job silent, so it is dropped and reported until the mapping is known.

Values matter as well as names. `pricetype=rentpermonth` works for both rent types, while `pricetype=calculatedtotalrent` ("Warmmiete") is apartments only. `purchaseprice`, `buy`, `rentpersqm` and `lease` are commercial values and are rejected by every residential type.

`equipment` values are taken exactly as the website spells them (`builtinkitchen`, `guesttoilet`, `handicappedaccessible`). The camel case spellings the translator used to build resolve to identical result counts, and a value the API does not know is ignored rather than rejected.

### Defaults and precedence

Rent apartment searches hide exchange flats (`exclusioncriteria=swapflat`) unless the URL says otherwise; no other type, and no search naming several types, carries a default. Where several sources set the same parameter, the later one wins - **query parameter beats path filter beats default** - which is what the website itself does:

```
wohnung-mieten?exclusioncriteria=projectlisting  -> projectlisting alone, exchange flats come back
haus-mit-garage-kaufen?equipment=cellar          -> cellar alone, not cellar plus garage
```

### Location

| Web URL | Mobile parameters |
|---|---|
| `/Suche/de/<state>/<city>/<type>` | `searchType=region&geocodes=/de/<state>/<city>` |
| `…?geocodes=1276010037,1276010014` | `searchType=region&geocodes=1276010037,1276010014` (districts replace the path's city) |
| `/Suche/radius/<type>?geocoordinates=lat;lng;km` | `searchType=radius&geocoordinates=lat;lng;km` |
| `/Suche/shape/<type>?shape=…` | `searchType=shape&shape=<polyline>` |
| `/regional/<state>/<municipality>/<type>` (Austrian site) | `searchType=region&geocodes=/at/<state>/<municipality>` |
| `/regional/oesterreich/<type>` (Austrian site) | `searchType=region&geocodes=/at` - the API rejects `/at/oesterreich` |

The two national namespaces are not equally deep. `/de` takes three levels, so
`/de/berlin/berlin/mitte` resolves to Berlin-Mitte; `/at` takes two and answers 412 for a third,
whichever way a Viennese district is spelled (`1-bezirk-innere-stadt`, `innere-stadt`, `1010`,
`wien-innere-stadt` were all tried). Austrian searches below the municipality therefore cannot be
expressed at all and have to be widened.

The `shape` parameter arrives in two flavours: base64 wrapped (map editor links, padded with `.` instead of `=`) or as a bare Google Encoded Polyline (shapes drawn by hand). Decoding a bare polyline does not fail loudly, it produces invalid UTF-8 and the API answers `400 Cannot parse shape`, so the translator only decodes input that could be base64 and only keeps a decode that looks like a polyline.
