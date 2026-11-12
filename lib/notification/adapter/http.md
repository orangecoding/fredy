### HTTP Adapter

This is a generic adapter for sending notifications via HTTP requests.
You can leverage this adapter to integrate with various webhooks or APIs that accept HTTP requests. (e.g. Supabase
Functions, a Node.js server, etc.)

HTTP adapter supports a `authToken` field, which can be used to include an authorization token in the request headers.
Your token would be included as a Bearer token in the `Authorization` header, which is a common method for securing API requests.

Request Details:
<details>
Request Method: POST  

Headers:

```
Content Type: `application/json`
Authorization: Bearer {your-optional-auth-token}
```

Body:

```json
{
  "jobId": "mg1waX4RHmIzL5NDYtYp-",
  "provider": "immoscout",
  "timestamp": "2024-06-15T12:34:56Z",
  "listings": [
    {
      "address": "Str. 123, Bielefeld, Germany",
      "description": "Möbliert: Einziehen & wohlfühlen: Neu möbliert.",
      "id": "123456789",
      "imageUrl": "https://<target-url>.com/listings/123456789.jpg",
      "price": "1.240 €",
      "size": "38 m²",
      "title": "Schöne 1-Zimmer-Wohnung in Bielefeld",
      "url": "https://<target-url>.com/listings/123456789"
    }
  ]
}
```

</details>

### Picture galleries

Where the provider already has a listing's pictures (from the search result, or from the detail page when "provider details" is enabled), the entry also carries them as `images`, floor plans first and at most 20; otherwise the field is left out.

```json
"images": [
  { "url": "https://<target-url>.com/listings/123456789-plan.jpg", "caption": "Grundriss", "floorPlan": true },
  { "url": "https://<target-url>.com/listings/123456789-2.jpg", "caption": "Wohnzimmer" }
]
```

### Listing facts

Beyond the card, an entry carries whatever else Fredy knows about the listing. Each field is left out when the listing does not know it - the portal does not state it, or the step that produces it is switched off - so a missing key means "unknown", never a value.

```json
"rooms": "2 Zimmer",
"buildYear": 1972,
"energyClass": "D",
"currency": "EUR",
"chargesIncluded": false,
"charges": 180,
"publishedAt": "2026-11-09T08:00:00.000Z",
"latitude": 49.41,
"longitude": 8.69,
"market": { "medianPricePerSqm": 15.2, "sampleSize": 23, "radiusKm": 2 }
```

- `rooms` is formatted like `price` and `size`.
- `buildYear` and `energyClass` mostly arrive with "provider details" enabled for the provider.
- `chargesIncluded` and `charges` are only set for rents where the portal says whether the price includes the running charges.
- `latitude`/`longitude` come from geocoding the address, `market` from the market benchmark around the listing.

### Price changes

When price tracking is enabled (Settings > Price tracking, off by default), price changes are POSTed to the same endpoint under an `event: "priceChange"` discriminator, with the entries under `priceChanges` rather than `listings`. Each entry carries `oldPrice`, `newPrice`, `changePercent` and `direction` alongside the usual listing fields. A receiver written before this existed keeps parsing `listings` exactly as before.
