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

### Price changes

When price tracking is enabled (Settings > Price tracking, off by default), price changes are POSTed to the same endpoint under an `event: "priceChange"` discriminator, with the entries under `priceChanges` rather than `listings`. Each entry carries `oldPrice`, `newPrice`, `changePercent` and `direction` alongside the usual listing fields. A receiver written before this existed keeps parsing `listings` exactly as before.
